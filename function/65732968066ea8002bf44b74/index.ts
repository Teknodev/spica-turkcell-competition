import * as Bucket from "@spica-devkit/bucket";
import * as Identity from "@spica-devkit/identity";
import { database, ObjectId } from "@spica-devkit/database";

const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const CONTACT_MESSAGE_ID = process.env.CONTACT_MESSAGE_ID;
const API_KEY = process.env.API_KEY;


Bucket.initialize({
    apikey: API_KEY,
})
Identity.initialize({
    apikey: API_KEY,
})


export async function onContactMessageInserted(change) {
    addingMsisdn(change);
}

async function addingMsisdn(change) {
    const contact_message = change.current;
    const identity = await Bucket.data.get(USER_BUCKET_ID, contact_message.user).then((res) => res.identity);
    const msisdn = await Identity.get(identity).then((res) => res.attributes.msisdn);
    await Bucket.data.patch(CONTACT_MESSAGE_ID, contact_message._id, { msisdn });
}
export async function nullToUndefined(req, res) {
    let db = await database().catch(err => console.log("ERROR 2", err));


    try {
        await db.collection(`bucket_${USER_BUCKET_ID}`).updateMany(
            { profile_photo: null },
            { $unset: { profile_photo: "" } },
            {limit: 10000}
        )

    } catch (err) {
        console.log(err)
    }

    let count =  await db.collection(`bucket_${USER_BUCKET_ID}`).find({$and: [{profile_photo: {$exists:true}}, {profile_photo: null}]}).count();
    console.log("count", count )

    return res.status(201).send("ok")

}