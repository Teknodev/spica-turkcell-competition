import { database, close } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
var jwt = require("jsonwebtoken");
import * as Identity from "@spica-devkit/identity";

const MATCHMAKING_BUCKET_ID = process.env.MATCHMAKING_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const SECRET_API_KEY = process.env.SECRET_API_KEY;
const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;

let db;

export async function addMatchMaking(req, res) {
    let token = getToken(req.headers.get("authorization"));

    // Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    let token_object = await tokenVerified(token);
    
    if (token_object.error === false) {
        let decoded_token = token_object.decoded_token;

        if (!db) db = await database();
        const users_collection = db.collection(`bucket_${USER_BUCKET_ID}`);
        const matchmaking_collection = db.collection(`bucket_${MATCHMAKING_BUCKET_ID}`);

        const { user, min_elo, max_elo } = req.body;

        // let user_object = await Bucket.data
        //     .getAll(`${USER_BUCKET_ID}`, {
        //         queryParams: {
        //             filter: {
        //                 identity: decoded_token._id
        //             }
        //         }
        //     })
        //     .then(user_res => user_res[0]);
        let user_object = await users_collection
            .findOne({ identity: decoded_token._id })
            .catch(err => console.log("ERROR 1", err));
                
        if (user_object._id == user) {
            // if (user_object.can_play) {
            if (user_object.available_play_count > 0 || user_object.free_play) {
                const matchmaking_bucket = db.collection(`bucket_${MATCHMAKING_BUCKET_ID}`);

                let current_date = new Date(Date.now()).toISOString();

                const query = { user: user };
                const update = {
                    $set: { user: user, min_elo: min_elo, max_elo: max_elo, date: current_date }
                };
                const options = { upsert: true };

                await matchmaking_bucket.updateOne(query, update, options);

                // let matchmaking_object = await Bucket.data
                //     .getAll(`${MATCHMAKING_BUCKET_ID}`, {
                //         queryParams: { filter: { user: user } }
                //     })
                //     .then(data => data[0]);


                let matchmaking_object = await matchmaking_collection
                    .findOne({ user: user })
                    .catch(err => console.log("ERROR 2", err));

                return res.status(200).send(matchmaking_object);
            } else {
                return res.status(400).send({ message: "User has no available games" });
                //If last payment confirmation is success or fail, call a new payment confirmation
                //else return the pending confirmation result
            }
        } else {
            return res.status(400).send({ message: "Invalid operation for current user." });
        }
    } else {
        return res.status(400).send({ message: "Token is not verified." });
    }
}

// -----HELPER FUNCTION-----
function getToken(token) {
    if (token) {
        token = token.split(" ")[1];
    } else {
        token = "";
    }

    return token;
}

async function tokenVerified(token) {
    let response_object = {
        error: false
    };

    Identity.initialize({ apikey: `${SECRET_API_KEY}` });
    const decoded = await Identity.verifyToken(token).catch(err => (response_object.error = true));
    response_object.decoded_token = decoded;

    return response_object;
}