import { database, close, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
const jwt_decode = require("jwt-decode");

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;

let db;

export async function getUserRank(req, res) {
    let token = req.headers.get("authorization").split(" ")[1];
    let userPoint;
    if (!db) {
        db = await database();
    }
    const users_collection = db.collection(`bucket_${USER_BUCKET_ID}`);

    let decoded_token = jwt_decode(token);
    let identity_id = decoded_token._id;
    let request = await users_collection
        .findOne({ identity: identity_id })
        .catch(err => console.log("ERROR 1", err));
    if (!request._id) return res.status(400).send({ error: request });
    
    // user_id = request._id;
    userPoint = request.weekly_point;

    const userCollection = db.collection(`bucket_${USER_BUCKET_ID}`);
    let userRank = await userCollection.find({ weekly_point: { $gte: userPoint } }).count();
    // let firstThousand = await userCollection.find().limit(1).sort({ weekly_point: -1 }).skip(999).toArray();
    // let userRank = 1001;
    // if (firstThousand[0].weekly_point < userPoint) {
    //     userRank = await userCollection.find({ weekly_point: { $gte: userPoint } }).count();
    // }

    return res.status(200).send({ rank: userRank });
}

export async function getLeaderUsers(req, res) {
    if (!db) {
        db = await database();
    }
    const users_collection = db.collection(`bucket_${USER_BUCKET_ID}`);
    let leaders = await users_collection
        .find().sort({ weekly_point: -1 }).limit(10).toArray()
        .catch(err => console.log("ERROR 2", err));


    return res.status(200).send(leaders);
}