import { database, ObjectId } from "@spica-devkit/database";
import * as Identity from "@spica-devkit/identity";

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID

let db;

export async function changeName(req, res) {
    const { userId, name } = req.body;
    if (!db) {
        db = await database().catch(err => console.log("ERROR 1", err));
    }

    let token = getToken(req.headers.get("authorization"));
    let token_object = await tokenVerified(token);

    const userCollection = db.collection(`bucket_${USER_BUCKET_ID}`);

    if (token_object.error === false) {
        await userCollection.updateOne({ _id: ObjectId(userId) }, {
            $set: { name: name }
        }).catch(err => console.log("ERROR 2 ", err))
        return res.status(200).send({ message: "successful" });
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


export async function setDatas(req, res) {
    const { data } = req.body;
    if (!db) {
        db = await database().catch(err => console.log("ERROR 30", err));
    }

    const collection = db.collection(`policies`);
    // const col = await collection.find().toArray().catch(err => console.log("ERROR", err))
    

    for (let el of data) {
        el._id = ObjectId(el._id)

        await collection.insertOne(el).catch(err => console.log("ERROR", err))
    }

    return res.status(200).send(true)
}