import { database, close, ObjectId } from "@spica-devkit/database";

const DUEL_BUCKET_ID = process.env.DUEL_BUCKET_ID;
const ALERT_BUCKET_ID = process.env.ALERT_BUCKET_ID;
const PAST_MATCHES_BUCKET_ID = process.env.PAST_MATCHES_BUCKET_ID;

let db;

export async function duelHighLoads() {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 1", err));
    }

    let now2 = new Date();

    const duelCollection = db.collection(`bucket_${DUEL_BUCKET_ID}`);
    const alertCollection = db.collection(`bucket_${ALERT_BUCKET_ID}`);

    const duels = await duelCollection
        .find({ is_finished: { $exists: false } })
        .toArray()
        .catch(err => console.log("ERROR 2", err));

    if (duels.length == 50) {
        const lastAlert = await alertCollection
            .find()
            .sort({ _id: -1 })
            .limit(1)
            .toArray()
            .catch(err => console.log("ERROR 8", err));

        if (
            !lastAlert[0] ||
            (lastAlert[0] && lastAlert[0].date < now2.setMinutes(now2.getMinutes() - 10))
        ) {
            await alertCollection
                .insertOne({
                    title: "Competition: Duel High Loads",
                    message: "The number of duels has been achieved to 50",
                    date: new Date()
                })
                .catch(err => {
                    console.log("Error 7", err);
                });
        }
    }
    return true;
}

export async function checkPastMatch() {
    let now = new Date();
    let now2 = new Date();
    if (!db) {
        db = await database().catch(err => console.log("ERROR 3", err));
    }

    const pastMachesCollection = db.collection(`bucket_${PAST_MATCHES_BUCKET_ID}`);
    const alertCollection = db.collection(`bucket_${ALERT_BUCKET_ID}`);

    const duel = await pastMachesCollection
        .find()
        .sort({ _id: -1 })
        .limit(1)
        .toArray()
        .catch(err => console.log("ERROR 4", err));

    if (duel[0].end_time < now.setMinutes(now.getMinutes() - 10)) {
        const lastAlert = await alertCollection
            .find()
            .sort({ _id: -1 })
            .limit(1)
            .toArray()
            .catch(err => console.log("ERROR 5", err));

        if (
            !lastAlert[0] ||
            (lastAlert[0] && lastAlert[0].date < now2.setMinutes(now2.getMinutes() - 10))
        ) {
            await alertCollection
                .insertOne({
                    title: "Competition: WARNING!",
                    message: "There have been no matches in 10 minutes!",
                    date: new Date()
                })
                .catch(err => {
                    console.log("ERROR 6: ", err);
                });
        }
    }
    return true;
}
