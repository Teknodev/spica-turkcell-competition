import * as Bucket from "@spica-devkit/bucket";
import { database, close, ObjectId } from "@spica-devkit/database";

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const DUEL_ANSWERS_BUCKET_ID = process.env.DUEL_ANSWERS_BUCKET_ID;
const DUEL_BUCKET_ID = process.env.DUEL_BUCKET_ID;
const PAST_DUELS_BUCKET_ID = process.env.PAST_DUELS_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const DELETED_MATCHES_BUCKET = process.env.DELETED_MATCHES_BUCKET;

let db;

export async function checkFinishedDuels() {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 2", err));
    }
    Bucket.initialize({ apikey: SECRET_API_KEY });

    setInterval(async () => {
        // console.log("1-interval");
        // const db = await database();

        const t = new Date();
        t.setSeconds(t.getSeconds() - 60);

        const finishedDuels = await db
            .collection(`bucket_${DUEL_BUCKET_ID}`)
            .aggregate([
                {
                    $match: {
                        $and: [
                            { last_question_date: { $exists: true } },
                            { last_question_date: { $lt: t } }
                        ]

                        // last_question_date: {
                        //     $lt: t
                        // }
                        /*$and: [
                            { last_question_date: { $exists: true } },
                            { last_question_date: { $lt: t } }
                        ]*/
                    }
                },
                {
                    $set: {
                        _id: {
                            $toString: "$_id"
                        },
                        user1: {
                            $toObjectId: "$user1"
                        },
                        user2: {
                            $toObjectId: "$user2"
                        }
                    }
                },
                {
                    $lookup: {
                        from: `bucket_${USER_BUCKET_ID}`,
                        localField: "user1",
                        foreignField: "_id",
                        as: "user1"
                    }
                },
                {
                    $unwind: { path: "$user1", preserveNullAndEmptyArrays: true }
                },
                {
                    $lookup: {
                        from: `bucket_${USER_BUCKET_ID}`,
                        localField: "user2",
                        foreignField: "_id",
                        as: "user2"
                    }
                },
                {
                    $unwind: { path: "$user2", preserveNullAndEmptyArrays: true }
                },
                {
                    $set: {
                        "user1._id": {
                            $toString: "$user1._id"
                        },
                        "user2._id": {
                            $toString: "$user2._id"
                        }
                    }
                }
            ])
            .toArray()
            .catch(async e => {
                console.log("ERROR 3", e);
            });

        if (finishedDuels) {
            for (let duel of finishedDuels) {
                let duelId = duel._id.toString();

                const pastDuel = await db
                    .collection(`bucket_${PAST_DUELS_BUCKET_ID}`)
                    .find({ duel_id: duelId })
                    .toArray()
                    .catch(err => console.log("ERROR 5", err));

                let answers = await db
                    .collection(`bucket_${DUEL_ANSWERS_BUCKET_ID}`)
                    .find({ duel: duelId })
                    .toArray()
                    .catch(err => console.log("ERROR 6", err));

                if (
                    !pastDuel.length &&
                    (duel.winner_of_current_question == 1 || duel.winner_of_current_question == 2)
                ) {
                    console.log("CHECK FINISH DUEL IF")
                    await db
                        .collection(`bucket_${PAST_DUELS_BUCKET_ID}`)
                        .insert({
                            duel_id: duelId,
                            name: duel.user1.name + " vs " + duel.user2.name,
                            user1: duel.user1._id,
                            user2: duel.user2._id,
                            questions: answers.map(answer => JSON.stringify(answer)),
                            winner: duel.winner_of_current_question,
                            start_time: ObjectId(duelId).getTimestamp(),
                            end_time: new Date()
                        })
                        .catch(err => console.log("ERROR 7", err));
                } else if (
                    !pastDuel.length &&
                    (duel.winner_of_current_question == 0 || duel.winner_of_current_question == 3)
                ) {
                    await db
                        .collection(`bucket_${DELETED_MATCHES_BUCKET}`)
                        .insert({
                            duel_id: duelId,
                            name: duel.user1.name + " vs " + duel.user2.name,
                            user1: duel.user1._id,
                            user2: duel.user2._id,
                            questions: answers.map(answer => JSON.stringify(answer)),
                            winner: duel.winner_of_current_question,
                            start_time: ObjectId(duelId).getTimestamp(),
                            end_time: new Date(),
                            user1_is_free: duel.user1_is_free,
                            user2_is_free: duel.user2_is_free
                        })
                        .catch(err => console.log("ERROR 11", err));
                }

                // ----->

                // let user1EarnedPoints = 0;
                // let user2EarnedPoints = 0;
                // answers.forEach(answer => {
                //     if (answer.correct_answer == answer.user1_answer) user1EarnedPoints += 10;
                //     if (answer.correct_answer == answer.user2_answer) user2EarnedPoints += 10;
                // });

                // if (duel.winner_of_current_question == 1) {
                //     duel.user1.win_count += 1;
                //     duel.user2.lose_count += 1;

                //     duel.user1.elo += 25;
                //     duel.user2.elo = Math.max(duel.user2.elo - 25, 0);
                // } else if (duel.winner_of_current_question == 2) {
                //     duel.user2.win_count += 1;
                //     duel.user1.lose_count += 1;

                //     duel.user2.elo += 25;
                //     duel.user1.elo = Math.max(duel.user1.elo - 25, 0);
                // }

                // db.collection(`bucket_${USER_BUCKET_ID}`).findOneAndUpdate(
                //     {
                //         _id: ObjectId(duel.user1._id)
                //     },
                //     {
                //         $set: {
                //             total_point: parseInt(duel.user1.total_point) + user1EarnedPoints,
                //             weekly_point: duel.user1.weekly_point + user1EarnedPoints,
                //             win_count: duel.user1.win_count,
                //             lose_count: duel.user1.lose_count,
                //             elo: duel.user1.elo
                //         }
                //     }
                // );

                // db.collection(`bucket_${USER_BUCKET_ID}`).findOneAndUpdate(
                //     {
                //         _id: ObjectId(duel.user2._id)
                //     },
                //     {
                //         $set: {
                //             total_point: parseInt(duel.user2.total_point) + user2EarnedPoints,
                //             weekly_point: duel.user2.weekly_point + user2EarnedPoints,
                //             win_count: duel.user2.win_count,
                //             lose_count: duel.user2.lose_count,
                //             elo: duel.user2.elo
                //         }
                //     }
                // );

                // <----

                /*
            Bucket.data.patch(USER_BUCKET_ID, duel.user1._id, {
                total_point: parseInt(duel.user1.total_point) + user1EarnedPoints,
                weekly_point: duel.user1.weekly_point + user1EarnedPoints,
                win_count: duel.user1.win_count,
                lose_count: duel.user1.lose_count,
                elo: duel.user1.elo
            });
            Bucket.data.patch(USER_BUCKET_ID, duel.user2._id, {
                total_point: parseInt(duel.user2.total_point) + user2EarnedPoints,
                weekly_point: duel.user2.weekly_point + user2EarnedPoints,
                win_count: duel.user2.win_count,
                lose_count: duel.user2.lose_count,
                elo: duel.user2.elo
            });
            */

                await db
                    .collection(`bucket_${DUEL_BUCKET_ID}`)
                    .deleteOne({
                        _id: ObjectId(duelId)
                    })
                    .then(data => { })
                    .catch(err => console.log("ERROR 8", err));
                // /*
                //     Bucket.data.remove(DUEL_BUCKET_ID, duelId);
                //     */

                await db
                    .collection(`bucket_${DUEL_ANSWERS_BUCKET_ID}`)
                    .deleteMany({
                        duel: duelId
                    })
                    .catch(err => console.log("ERROR 9", err));

                /*
                const question_answers_collection = db.collection(`bucket_${DUEL_ANSWERS_BUCKET_ID}`);
                await question_answers_collection.deleteMany({ duel: ObjectId(duel._id) });
                */
            }
        }

        const t2 = new Date();
        t2.setSeconds(t2.getSeconds() - 25);

        await db
            .collection(`bucket_${DUEL_BUCKET_ID}`)
            .deleteMany({ created_at: { $lt: t2 }, last_question_date: { $exists: false } })
            .catch(err => console.log("ERROR 10", err));
        
    }, 10000);
}

export async function availablePlayForDeletedMatch(change) {
    let target = change.document;

    if (!db) {
        db = await database().catch(err => console.log("ERROR 16 ", err));
    }

    const users = [ObjectId(target.user1), ObjectId(target.user2)]

    let usersCollection = db.collection(`bucket_${USER_BUCKET_ID}`);

    await usersCollection
        .updateMany(
            { _id: { $in: users }, bot: false, available_play_count: 0 },
            {
                $set: {
                    available_play_count: 1
                }
            }
        )
        .catch(err => console.log("ERROR 21", err));

    return true
}