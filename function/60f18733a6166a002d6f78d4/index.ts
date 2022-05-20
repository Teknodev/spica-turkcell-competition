import { database, close, ObjectId } from "@spica-devkit/database";

const PAST_MATCHES_BUCKET_ID = process.env.PAST_MATCHES_BUCKET_ID;
const REWARD_LOGS_BUCKET_ID = process.env.REWARD_LOGS_BUCKET_ID;
const CHARGE_LOGS_BUCKET_ID = process.env.CHARGE_LOGS_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const CONFIRMATION_CODES_BUCKET_ID = process.env.CONFIRMATION_CODES_BUCKET_ID;

export async function serverReady(req, res) {
    let db = await database();

    let bucketsObj = [
        { bucket: PAST_MATCHES_BUCKET_ID, field: "duel_id" },
        { bucket: PAST_MATCHES_BUCKET_ID, field: "user1" },
        { bucket: PAST_MATCHES_BUCKET_ID, field: "user2" },
        { bucket: REWARD_LOGS_BUCKET_ID, field: "msisdn" },
        { bucket: CHARGE_LOGS_BUCKET_ID, field: "msisdn" },
        { bucket: CONFIRMATION_CODES_BUCKET_ID, field: "msisdn" },
        { bucket: USER_BUCKET_ID, field: "identity" },
        { bucket: USER_BUCKET_ID, field: "weekly_point" }
    ];

    for (let obj of bucketsObj) {
        let filter = {};
        filter[obj.field] = 1;
        let indexes = await db.collection(`bucket_${obj.bucket}`).indexes();
        let isIndexExists = indexes.filter(index => index.name.includes(obj.field));
        console.log(obj.field, isIndexExists);
        if (!isIndexExists.length) {
            await db.collection(`bucket_${obj.bucket}`).createIndex(filter);
        }
    }
    close();
    return res.status(200).send("ok");
}

export async function getAllIndexes(req, res) {
    let db = await database();
    let indexes = await db.collection(`identity`).indexes();

    // const allCollections = await db.listCollections().toArray().catch((err) => console.log(err))

    // let colNames = []
    // allCollections.forEach((el) => colNames.push(el.name))

    // const result = []
    // const colNames = ["bucket_615b15727db15e002decaa57", "bucket_605c9772e9960e002c278196", "bucket_60aa13679835cd002c1c9a1a", "bucket_61790e4c3ff58f002d116dfd", "bucket_6089425e11641f002cef9f1c", "bucket_60c071bbb04bcc002c40f5c9", "bucket_60d71eff5181e4002c01fbcf","bucket_6076d414a04c51002d256292", "bucket_6067a4ece9960e002c2787e3", "bucket_60ab7235c03a2d002eb2f574", "bucket_60d71e105181e4002c01fb06", "bucket_60d71e805181e4002c01fb46", "bucket_60c3a68ef30c8a002de50f27", "bucket_6067935ee9960e002c27877f", "bucket_609669f805b0df002ceb2517", "bucket_606c138f6b2647002c2fc497", "bucket_615b15087db15e002deca91a", "bucket_608bb7901c4a8c002cba4092", "bucket_60b624726c7ed4002c5b96e5", "bucket_60802062ba6a15002c91793f", "bucket_60c071bbb04bcc002c40f5c8", "bucket_607808eba04c51002d25a007", "bucket_60802062ba6a15002c91793e", "bucket_60742ed3f95e39002c4917ae", "bucket_60802062ba6a15002c917940", "bucket_60802060ba6a15002c91793c", "bucket_605c9480e9960e002c278191", "bucket_616452bd7db15e002d065d98", "bucket_605c98e2e9960e002c27819a", "bucket_605cdcd3e9960e002c2781ad", "identity", "bucket_605ca983e9960e002c2781a9", "bucket_615b15be7db15e002decab69", "bucket_616ffaf33ff58f002dff389b", "bucket_608ac3061c4a8c002cba02a5", "bucket_608a697abce757002c808288", "bucket_607e999310426d002ca33a0d", "bucket_60802061ba6a15002c91793d", "bucket_6066df29e9960e002c27843b", "bucket_605c9cdfe9960e002c27819d", "bucket_6076d414a04c51002d256291", "bucket_616e7b1a7db15e002d1e2278", "bucket_6066df8fe9960e002c27843d", "bucket_61a8de737d4014002d46b3be", "bucket_605ca275e9960e002c2781a4"]
    // for (let col of colNames) {
    //     let indexes = await db.collection(col).indexes();
    //     result.push({
    //         name: col,
    //         indexes: indexes
    //     })

    // }

    // let db = await database();

    // let bucketsObj = [
    //     { bucket: 'identity', field: "attributes.msisdn" },
    //     { bucket: 'identity', field: "identifier" }
    // ];

    // for (let obj of bucketsObj) {
    //     let filter = {};
    //     filter[obj.field] = 1;
    //     let indexes = await db.collection(obj.bucket).indexes();
    //     let isIndexExists = indexes.filter(index => index.name.includes(obj.field));
    //     console.log(obj.field, isIndexExists);
    //     if (!isIndexExists.length) {
    //         await db.collection(obj.bucket == 'identity' ? obj.bucket : `bucket_${obj.bucket}`).createIndex(filter);
    //     }
    // }

    // return true;

    return res.status(200).send({ result: indexes })
}