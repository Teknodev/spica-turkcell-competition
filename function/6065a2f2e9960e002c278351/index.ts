import * as Bucket from "@spica-devkit/bucket";
import { database, close, ObjectId } from "@spica-devkit/database";

const MATCHMAKING_BUCKET_ID = process.env.MATCHMAKING_BUCKET_ID;
const DUEL_BUCKET_ID = process.env.DUEL_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const CONFIGURATION_BUCKET_ID = process.env.CONFIGURATION_BUCKET_ID;

const SECRET_API_KEY = process.env.SECRET_API_KEY;
let db;

export async function matchmaker() {
    // DATABASE
    if (!db) {
        db = await database();
    }
    const matchmaking_collection = db.collection(`bucket_${MATCHMAKING_BUCKET_ID}`);
    const duel_collection = db.collection(`bucket_${DUEL_BUCKET_ID}`);
    const users_collection = db.collection(`bucket_${USER_BUCKET_ID}`);
    const configurations_collection = db.collection(`bucket_${CONFIGURATION_BUCKET_ID}`);

    //BUCKET
    // Bucket.initialize({ apikey: `${SECRET_API_KEY}` });

    setInterval(async () => {
        // console.log("1");
        // let match_making_users = await Bucket.data.getAll(`${MATCHMAKING_BUCKET_ID}`, {
        //     queryParams: {
        //         relation: true
        //     }
        // });

        let match_making_users = await matchmaking_collection
            .aggregate([
                {
                    $set: {
                        _id: {
                            $toString: "$_id"
                        },
                        user: {
                            $toObjectId: "$user"
                        }
                    }
                },
                {
                    $lookup: {
                        from: `bucket_${USER_BUCKET_ID}`,
                        localField: "user",
                        foreignField: "_id",
                        as: "user"
                    }
                },
                {
                    $unwind: { path: "$user", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: {
                        "user._id": {
                            $toString: "$user._id"
                        }
                    }
                }
            ])
            .toArray()
            .catch(err => console.log("ERROR 1", err));
        
        // get all bots
        // let bots = await Bucket.data.getAll(`${USER_BUCKET_ID}`, {
        //     queryParams: {
        //         filter: {
        //             bot: true
        //         }
        //     }
        // });

        // let configuration = await Bucket.data.getAll(`${CONFIGURATION_BUCKET_ID}`, {
        //     queryParams: { filter: { key: "elo_iteration_width" } }
        // });

        let bots = await users_collection
            .find({ bot: true })
            .toArray()
            .catch(err => console.log("ERROR 2", err));

        let configuration = await configurations_collection
            .find({ key: "elo_iteration_width" })
            .toArray()
            .catch(err => console.log("ERROR 3", err));

        let { matched_with_user, unmatched_with_user } = seperateMatchingsUsers([
            ...match_making_users
        ]);

        let { matched_with_bots, unmatched_with_bots } = seperateMatchingWithBot([
            ...unmatched_with_user
        ]);

        // 1 - add mathced users to ->> duel ->> delete from ->> matchmaking bucket
        let duels_with_user_array = createDuelObjectsWithUser([...matched_with_user]);
        if (duels_with_user_array.length > 0)
            await duel_collection.insertMany(duels_with_user_array);

        let delete_match_with_user_filter = matchedWithUserDeleteFilter([...matched_with_user]);
        await matchmaking_collection.deleteMany(delete_match_with_user_filter);

        // 2 - get random bot ->> add matched users(matched with bot) to ->> duel ->> delete these users from ->> matchmaking bucket
        let bot = getRandomBot([...bots]);
        let duels_with_bots_array = createDuelObjectsWithBot([...matched_with_bots], bot);
        if (duels_with_bots_array.length > 0)
            await duel_collection.insertMany(duels_with_bots_array);

        let delete_match_with_bot_filter = nonMatchedWithUserDeleteFilter([...matched_with_bots]);
        let deleteManyRequest = await matchmaking_collection.deleteMany(
            delete_match_with_bot_filter
        );

        // 3- change (time and) elo of unmatched ->> delete these users from ->> matchmaking bucket ->> insert updated users to ->> matchmaking bucket
        // let elo_iteration_width = configuration[0].value;

        // old delete-update-add method
        // let updated_unmatched_users = updateUnmatchedMatches(unmatched_with_bots, elo_iteration_width);

        let delete_unmatch_with_bots_filter = nonMatchedWithUserDeleteFilter([
            ...unmatched_with_bots
        ]);
        // await matchmaking_collection.deleteMany(delete_unmatch_with_bots_filter);
        // await matchmaking_collection.insertMany(updated_unmatched_users);

        // deleting and adding again is not working correctly
        // end of an iteration

        /*
        UPDATE (new update method)
        */

        await matchmaking_collection.updateMany(delete_unmatch_with_bots_filter, {
            $inc: { max_elo: 20, min_elo: -20 }
        });

        // console.log(
        //     "matched_with_user",
        //     JSON.stringify(matched_with_user),
        //     "matched_with_bots",
        //     JSON.stringify(matched_with_bots),
        //     "unmatched_with_bots",
        //     JSON.stringify(unmatched_with_bots)
        // );

        // console.log("2");
    }, 10000);
}

// DATA MANIPULATION FUNCTIONS
function createDuelObjectsWithUser(matchmaking_users) {
    let duel_array = [];
    let current_date = new Date();

    for (const matchmaking_user of matchmaking_users) {
        duel_array.push({
            user1: matchmaking_user[0].user._id,
            user2: matchmaking_user[1].user._id,
            user1_ready: false,
            user2_ready: false,
            created_at: current_date,
            user1_is_free: !!!matchmaking_user[0].user.available_play_count,
            user2_is_free: !!!matchmaking_user[1].user.available_play_count,
            duel_type: 0,
            user1_identity: matchmaking_user[0].user.identity,
            user2_identity: matchmaking_user[1].user.identity,
        });
    }

    return duel_array;
}

function createDuelObjectsWithBot(matchmaking_users, bot) {
    let duel_array = [];
    //console.log("matchmaking_users", matchmaking_users);
    let current_date = new Date();

    for (const matchmaking_user of matchmaking_users) {
        duel_array.push({
            user1: matchmaking_user.user._id,
            user2: bot._id,
            user1_ready: false,
            user2_ready: true,
            created_at: current_date,
            user1_is_free: !!!matchmaking_user.user.available_play_count,
            user2_is_free: false,
            duel_type: 1,
            user1_identity: matchmaking_user.user.identity
        });
    }

    return duel_array;
}

function matchedWithUserDeleteFilter(matched_with_users) {
    let in_array = [];

    for (const matched_with_user of matched_with_users) {
        in_array.push(ObjectId(matched_with_user[0]._id));
        in_array.push(ObjectId(matched_with_user[1]._id));
    }

    return {
        _id: {
            $in: in_array
        }
    };
}

function nonMatchedWithUserDeleteFilter(matchmaking_users) {
    let in_array = [];

    // use map please

    for (const matchmaking_user of matchmaking_users) {
        in_array.push(ObjectId(matchmaking_user._id));
    }

    return {
        _id: {
            $in: in_array
        }
    };
}

function updateUnmatchedMatches(unmatched_with_bots, elo_iteration_width) {
    // deleting _id and updating min & max elo

    //console.log(elo_iteration_width);
    // use map
    for (let unmatched_matchmaking_user of unmatched_with_bots) {
        let user_id = unmatched_matchmaking_user.user._id;

        // delete unmatched_matchmaking_user._id;
        delete unmatched_matchmaking_user.user;
        unmatched_matchmaking_user.user = user_id;

        unmatched_matchmaking_user.min_elo =
            parseInt(unmatched_matchmaking_user.min_elo, 10) - parseInt(elo_iteration_width, 10);

        unmatched_matchmaking_user.max_elo =
            parseInt(unmatched_matchmaking_user.max_elo, 10) + parseInt(elo_iteration_width, 10);
    }

    return unmatched_with_bots;
}

// HELPER FUNCTIONs
function getRandomBot(bots) {
    var bot = bots[Math.floor(Math.random() * bots.length)];

    return bot;
}

function seperateMatchingsUsers(matchmaking_users) {
    let matched = [];
    let unmatched = [];

    // old method
    // // matchmaking_users.forEach(matchmaking_user1,index => {
    // matchmaking_users.forEach(matchmaking_user1 => {
    //     //if user1 didn`t matched
    //     if (!inMatched(matchmaking_user1, matched)) {
    //         matchmaking_users.forEach(matchmaking_user2 => {
    //             //if objects are not same object
    //             if (matchmaking_user1._id != matchmaking_user2._id) {
    //                 // if user2 didn`t matched
    //                 if (!inMatched(matchmaking_user2, matched)) {
    //                     if (canMatched(matchmaking_user1, matchmaking_user2)) {
    //                         //users matched
    //                         matched.push([matchmaking_user1, matchmaking_user2]);

    //                         // error maybe
    //                         // matchmaking_users = removeObject(matchmaking_user1, [
    //                         //     ...matchmaking_users
    //                         // ]);
    //                         // matchmaking_users = removeObject(matchmaking_user2, [
    //                         //     ...matchmaking_users
    //                         // ]);
    //                         removeObject(matchmaking_user1, matchmaking_users);
    //                         removeObject(matchmaking_user2, matchmaking_users);
    //                     }
    //                 }
    //             }
    //         });
    //     }
    // });

    // return {
    //     matched_with_user: matched,
    //     unmatched_with_user: matchmaking_users
    // };

    // new method
    // --set matched
    for (let matchmaking_user1 of matchmaking_users) {
        // 1-if first user is matched
        if (!inMatched(matchmaking_user1, matched)) {
            for (let matchmaking_user2 of matchmaking_users) {
                // 2-if second user is matched
                if (
                    !inMatched(matchmaking_user2, matched) &&
                    matchmaking_user1._id != matchmaking_user2._id
                ) {
                    if (canMatched(matchmaking_user1, matchmaking_user2)) {
                        // 3-if both user not is matched
                        if (
                            !inMatched(matchmaking_user1, matched) &&
                            !inMatched(matchmaking_user2, matched)
                        ) {
                            matched.push([matchmaking_user1, matchmaking_user2]);
                        }
                    }
                }
            }
        }
    }

    // --set unmatched
    for (let matchmaking_user of matchmaking_users) {
        if (!inMatched(matchmaking_user, matched)) {
            unmatched.push(matchmaking_user);
        }
    }

    return {
        matched_with_user: matched,
        unmatched_with_user: unmatched
    };
}

function seperateMatchingWithBot(matchmaking_users) {
    let matched_with_bots = [];
    let unmatched_with_bots = [];

    // use find

    for (let matchmaking_user of matchmaking_users) {
        let now = new Date();
        let ending_time = new Date(matchmaking_user.date);

        // time passed
        if (ending_time < now) {
            //add with bots array and remove from unmatched users
            matched_with_bots.push(matchmaking_user);
            // matchmaking_users = removeObject(matchmaking_user, matchmaking_users);
        } else {
            unmatched_with_bots.push(matchmaking_user);
        }
    }

    return {
        matched_with_bots: matched_with_bots,
        unmatched_with_bots: unmatched_with_bots
    };
}

function removeObject(object, array) {
    let index = getIndexOfObject(object, array);
    if (index != -1) array.splice(index, 1);

    return array;
}

function getIndexOfObject(object, array) {
    var index = array
        .map(function (item) {
            return item._id;
        })
        .indexOf(object._id);

    return index;
}

//check user is in the already matched array or not
function inMatched(matchmaking_user, matched) {
    let response = false;

    /* user -> array find */
    // or use normal for and break when find it

    for (const match of matched) {
        if (match[0]._id == matchmaking_user._id || match[1]._id == matchmaking_user._id) {
            response = true;
            break;
        }
    }

    return response;
}

function canMatched(matchmaking_user1, matchmaking_user2) {
    let response;

    if (
        matchmaking_user1.min_elo <= matchmaking_user2.user.elo &&
        matchmaking_user2.user.elo <= matchmaking_user1.max_elo
    ) {
        response = true;
    } else {
        response = false;
    }

    return response;
}
