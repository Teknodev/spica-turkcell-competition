import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";

const PAST_MATCHES_BUCKET_ID = process.env.PAST_MATCHES_BUCKET_ID;
const SINGLEPLAY_PAST_MATCHES_BUCKET_ID = process.env.SINGLEPLAY_PAST_MATCHES_BUCKET_ID;
const REWARD_BUCKET_ID = process.env.REWARD_BUCKET_ID;
const CHARGE_BUCKET_ID = process.env.CHARGE_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const MANUALLY_REWARD_BUCKET_ID = process.env.MANUALLY_REWARD_BUCKET_ID;
const SECRET_API_KEY = process.env.SECRET_API_KEY;
const PLAY_COUNT_LOGS_BUCKET_ID = process.env.PLAY_COUNT_LOGS_BUCKET_ID;
const BUGGED_REWARDS_BUCKET_ID = process.env.BUGGED_REWARDS_BUCKET_ID;

const DAILY_1GB_OFFER_ID = 451318;
const HOURLY_1GB_OFFER_ID = 451319;
const DAILY_2GB_OFFER_ID = 455884;

let db;

export async function checkReward() {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 7 ", err));
    }
    // await retryNonRewardedMatches().catch(err => console.log("ERROR 12", err));
    await retryTcellIssues().catch(err => console.log("ERROR 13", err));
}

export async function retryNonRewardedMatches() {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 7 ", err));
    }
    const pastMatchesCollection = db.collection(`bucket_${PAST_MATCHES_BUCKET_ID}`);
    const rewardsCollection = db.collection(`bucket_${REWARD_BUCKET_ID}`);
    const usersCollection = db.collection(`bucket_${USER_BUCKET_ID}`);
    const identityCollection = db.collection(`identity`);

    let minDate = new Date();
    let maxDate = new Date();
    minDate.setMinutes(minDate.getMinutes() - 6);
    maxDate.setMinutes(maxDate.getMinutes() - 1);

    const duels = await pastMatchesCollection
        .find({
            end_time: {
                $gte: minDate,
                $lt: maxDate
            }
        })
        .toArray()
        .catch(err => console.log("ERROR 8 ", err));
    const rewards = await rewardsCollection
        .find({ date: { $gte: minDate, $lt: new Date() } })
        .toArray()
        .catch(err => console.log("ERROR 9 ", err));
    const usersArr = [];

    for (let duel of duels) {
        usersArr.push(ObjectId(duel.user1));
        usersArr.push(ObjectId(duel.user2));
    }

    const usersData = await usersCollection
        .find({ _id: { $in: usersArr } })
        .toArray()
        .catch(err => console.log("ERROR 10 ", err));

    const users = usersData.filter(user => {
        return user.bot == false;
    });

    const usersItentities = users.map(user => {
        return ObjectId(user.identity);
    });

    const identitiesData = await identityCollection
        .find({ _id: { $in: usersItentities } })
        .toArray()
        .catch(err => console.log("ERROR 11 ", err));

    users.forEach(user => {
        user["msisdn"] = identitiesData.filter(
            idn => idn._id == user.identity
        )[0].attributes.msisdn;
    });

    let reward = [];
    for (let duel of duels) {
        let user2Data = usersData.find(user => {
            return user._id == duel.user2;
        });

        let userMsisdn = undefined;
        let userIsFree = false;
        let user = null;
        if (duel.winner == 1) {
            userMsisdn = users.find(user => {
                return user._id == duel.user1;
            }).msisdn;
            userIsFree = duel.user1_is_free;
            user = duel.user1;
        } else if (duel.winner == 2 && user2Data && !user2Data.bot) {
            userMsisdn = users.find(user => {
                return user._id == duel.user2;
            });
            userMsisdn = userMsisdn ? userMsisdn.msisdn : "";
            userIsFree = duel.user2_is_free;
            user = duel.user2;
        }

        if (userMsisdn && user) {
            reward = rewards.find(el => {
                return (
                    el.msisdn.includes(userMsisdn) &&
                    el.match_id == duel._id.toString() &&
                    el.offer_id == (userIsFree ? HOURLY_1GB_OFFER_ID : DAILY_1GB_OFFER_ID)
                    //(el.status == true || (el.status == false && errors.includes(el.error_id)))
                );
            })
                ? reward
                : [
                    ...reward,
                    {
                        msisdn: userMsisdn,
                        reward: userIsFree ? "hourly_1" : "daily_1"
                    }
                ];
        }
    }


    for (let rew of reward) {
        await insertReward(rew.msisdn, rew.reward);
    }
}

async function retryTcellIssues() {
    const rewardsCollection = db.collection(`bucket_${BUGGED_REWARDS_BUCKET_ID}`);
    const manuallyRewardsCollection = db.collection(`bucket_${MANUALLY_REWARD_BUCKET_ID}`);
    const errors = ["3302", "3238", "3581", "3483"]; // TCELL ERROR
    // const errors = ["3287", "3230", "3282", "3204", "3483"]; // TCELL ERROR

    let minDate = new Date();
    minDate.setMinutes(minDate.getMinutes() - 240);

    let buggedRewards = await rewardsCollection
        .find({
            date: { $gte: minDate, $lt: new Date() },
            error_id: { $in: errors }
        })
        .toArray()
        .catch(err => console.log("ERROR 9 ", err));

    let buggedRewardsIds = Array.from(buggedRewards, x => x._id.toString());
    const manuallyRewards = await manuallyRewardsCollection
        .find({
            process_completed: true,
            retry_id: { $in: buggedRewardsIds }
        })
        .toArray()
        .catch(err => console.log("ERROR 14:", err));

    buggedRewards = buggedRewards.filter(
        reward => !manuallyRewards.find(mr => mr.retry_id == reward._id.toString())
    );
    const logData = [];
    for (let reward of buggedRewards) {
        let retryCount = await rewardsCollection.find({
            $and: [
                { match_id: { $exists: true } },
                { match_id: { $ne: '' } },
                { match_id: reward.match_id }
            ]
        }).toArray();
        if (retryCount.length < 24) {
            logData.push({
                msisdn: reward.msisdn.substring(2),
            })
            insertReward(
                reward.msisdn.substring(2),
                "daily_1", 
                reward._id
            );
        }
    }
    if (logData.length) {
        console.log("logData: ", logData)
    }
}

async function insertReward(msisdn, rewardType, retry_id = "") {
    //console.log(msisdn, rewardType, retry_id);
    Bucket.initialize({ apikey: SECRET_API_KEY });

    await Bucket.data
        .insert(MANUALLY_REWARD_BUCKET_ID, {
            msisdn: Number(msisdn),
            reward: rewardType,
            system: true,
            retry_id
        })
        .catch(err => console.log("ERROR 3: ", err));

    return true;
}

export async function detectUniqueCharges(req, res) {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 7 ", err));
    }

    let chargeCollection = db.collection(`bucket_60ab7235c03a2d002eb2f574`);
    let rewardsCollection = db.collection(`bucket_609669f805b0df002ceb2517`);
    let usersCollection = db.collection(`bucket_605c9480e9960e002c278191`);
    let identitiesCollection = db.collection("identity");
    let result = await chargeCollection
        .aggregate([
            { $match: { status: true } },
            { $group: { _id: "$msisdn", count: { $sum: 1 } } },
            { $match: { count: { $gte: 10 } } }
        ])
        .toArray();
    result = result.map(r => {
        return { msisdn: r._id, count: r.count };
    });

    let msisdns = result.map(r => r.msisdn);

    /*
    let identity = await identitiesCollection
        .find({ "attributes.msisdn": { $in: msisdns } })
        .toArray();

    let identitiesArray = identity.map(i => i._id.toString());
    let userDatas = await usersCollection
        .find({
            identity: { $in: identitiesArray }
        })
        .toArray();
*/
    let rewardsData = await rewardsCollection
        .aggregate([
            { $match: { msisdn: { $in: msisdns }, offer_id: 451319 } },
            { $group: { _id: "$msisdn", count: { $sum: 1 } } }
        ])
        .toArray();

    result.sort((a, b) => a.msisdn - b.msisdn);
    rewardsData.sort((a, b) => a._id - b._id);

    let total = 0;
    let warning = [];
    let max = 0;
    let min = 99;
    let diff = null;
    for (let userIndex in result) {
        diff = null;
        //result[userIndex] = { ...result[userIndex], ...userDatas[userIndex] };

        if (rewardsData[userIndex] && result[userIndex].count > rewardsData[userIndex].count) {
            warning.push(rewardsData[userIndex]);
            diff = result[userIndex].count - rewardsData[userIndex].count;
            total += diff;
        }

        if (diff && max < diff) {
            max = diff;
            if (max > 90)
                console.log(result[userIndex].count, rewardsData[userIndex].count, max, diff);
        }

        if (diff && min > diff) {
            min = diff;
        }
    }

    return { result, warning, results: result.length, warnings: warning.length, total, max, min };
}

export async function detectMissingAvailablePlay() {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 16 ", err));
    }

    const pastMatchesCollection = db.collection(`bucket_${SINGLEPLAY_PAST_MATCHES_BUCKET_ID}`);
    const chargeCollection = db.collection(`bucket_${CHARGE_BUCKET_ID}`);
    const usersCollection = db.collection(`bucket_${USER_BUCKET_ID}`);
    const playCountCollection = db.collection(`bucket_${PLAY_COUNT_LOGS_BUCKET_ID}`);
    const identityCollection = db.collection(`identity`);

    const uniqueMatches = [];
    const msisdns = [];
    const identitiesId = [];
    const resultArr = [];

    const minDate = new Date();
    minDate.setHours(minDate.getHours() - 2);

    const maxDate = new Date();
    maxDate.setMinutes(maxDate.getMinutes() - 10);

    const matchMaxDate = new Date();
    matchMaxDate.setMinutes(matchMaxDate.getMinutes() - 5);

    const chargeResult = await chargeCollection
        .aggregate([
            { $match: { status: true, date: { $gte: minDate, $lte: maxDate } } },
            { $group: { _id: "$msisdn", count: { $sum: 1 } } }
        ])
        .toArray();

    chargeResult.forEach(charge => {
        msisdns.push(charge._id.substr(2));
    });

    const identities = await identityCollection
        .find({ "attributes.msisdn": { $in: msisdns } })
        .toArray()
        .catch(err => console.log("ERROR 17", err));

    identities.forEach(identity => {
        identitiesId.push(String(identity._id));
    });

    const users = await usersCollection
        .find({ identity: { $in: identitiesId } })
        .toArray()
        .catch(err => console.log("ERROR 18", err));

    let userMatches = await pastMatchesCollection
        .aggregate([
            { $match: { start_time: { $gte: minDate, $lte: matchMaxDate }, user_is_free: false } },
            { $group: { _id: "$user", count: { $sum: 1 } } }
        ])
        .toArray()
        .catch(err => console.log("ERROR 19", err));

    // let user2Paid = await pastMatchesCollection
    //     .aggregate([
    //         {
    //             $match: {
    //                 start_time: { $gte: minDate, $lte: matchMaxDate },
    //                 user2_is_free: false,
    //                 player_type: 0
    //             }
    //         },
    //         { $group: { _id: "$user2", count: { $sum: 1 } } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 20", err));

    // let concatedMatches = user1Paid.concat(user2Paid);

    // concatedMatches.reduce(function (res, value) {
    //     if (!res[value._id]) {
    //         res[value._id] = {
    //             _id: value._id,
    //             count: 0
    //         };
    //         uniqueMatches.push(res[value._id]);
    //     }
    //     res[value._id].count += value.count;
    //     return res;
    // }, {});

    users.forEach(user => {
        let userIdeentity = identities.find(identity => String(identity._id) == user.identity);
        let userMatch = userMatches.find(userMatch => userMatch._id == String(user._id));
        userIdeentity ? (user["msisdn"] = userIdeentity.attributes.msisdn) : undefined;
        userMatch ? (user["match_count"] = userMatch.count) : undefined;
    });

    const manuallyAdded = [];
    chargeResult.forEach(charge => {
        let chargeUser = users.find(
            user => user.msisdn == charge._id.substr(2)
        );
        if (chargeUser) {
            let userMatchCount = chargeUser.available_play_count + (chargeUser.match_count || 0);
            if (charge.count > userMatchCount) {
                chargeUser["missing_play_count"] = charge.count - userMatchCount;
                manuallyAdded.push(chargeUser);
                resultArr.push({
                    _id: chargeUser._id,
                    msisdn: charge._id,
                    missing_play_count: charge.count - userMatchCount
                });
            }
        }
    });

    for (let user of manuallyAdded) {
        await usersCollection
            .updateOne(
                { _id: ObjectId(user._id) },
                {
                    $inc: {
                        available_play_count: user.missing_play_count
                    }
                }
            )
            .catch(err => console.log("ERROR 21", err));
    }

    if (resultArr.length > 0) {
        let insertedData = {
            title: "Play Count",
            added_play_count: [],
            created_at: new Date(),
        }
        resultArr.forEach(el => {
            insertedData.added_play_count.push({
                missing_play_count: el.missing_play_count,
                msisdn: el.msisdn
            })
        })
        await playCountCollection.insertOne(insertedData).catch(err => console.log("ERR", err))
        console.log("Manually Added Play Count: ", resultArr);
    }
}