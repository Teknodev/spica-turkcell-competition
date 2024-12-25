import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";

const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const CONFIRMATION_CODE_BUCKET_ID = process.env.CONFIRMATION_CODE_BUCKET_ID;

export async function clearUserPoint() {
    console.log("@observer::clearUserPoint");
    const db = await database().catch(err => console.log("ERROR 1", err));
    await db
        .collection(`bucket_${USER_BUCKET_ID}`)
        .updateMany({}, { $set: { weekly_point: 0, weekly_award: 0 } })
        .catch(err => console.log("ERROR 2", err));
}

export async function updateConfirmCode() {
    let date = new Date()
    date.setMinutes(date.getMinutes() - 2)

    const db = await database();

    const confirmCodeCollection = db.collection(`bucket_${CONFIRMATION_CODE_BUCKET_ID}`);
    confirmCodeCollection.updateMany({
        sent_date: { $lt: date },
        $or: [{ is_expired: false }, { is_expired: { $exists: false } }]
    },
        { $set: { is_expired: true } })
        .catch(err => console.log("ERROR ", err))
}

export async function detectError(req, res) {

    const db = await database().catch(err => console.log("ERROR 1", err));

    const rewards = await db
        .collection(`bucket_60aa13679835cd002c1c9a1a`)
        .find({ result: { $regex: "not found in catalog. Please check your offerId." } })
        .toArray()
        .catch(err => console.log("ERROR 2", err));

    let data = [];
    let msisdns = [];
    for (let reward of rewards) {
        if (!msisdns.includes(reward.msisdn)) {
            msisdns.push(reward.msisdn)
            data.push({
                msisdn: reward.msisdn,
                reward: reward.reward
            })
        }
    }

    // data = [...new Set(data)]


    // for (let rew of msisdns) {
    //     await insertReward(rew, "daily_1");
    // }

    return res.status(200).send(data)
}