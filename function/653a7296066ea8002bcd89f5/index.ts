import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
import fetch from 'node-fetch';

const USER_BUCKET = process.env.USER_BUCKET;
const SECRET_API_KEY = process.env.SECRET_API_KEY;
const PAST_MATCHES_BUCKET = process.env.PAST_MATCHES_BUCKET;
const CHARGE_LOGS_BUCKET = process.env.CHARGE_LOGS_BUCKET;

const CHARGE_AMOUNT = "25";


export async function onInsertedMatch(changed) {
    
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const document = changed.document;
    const usersIds = [document.user1]

    if (document.player_type == 0) {
        usersIds.push(document.user2)
    }

    const usersData = await getMsisdnsByUsersIds(usersIds);

    let isSuccess = true;
    let response = '';
    let bodyData = '';
    for (const [index, userData] of usersData.entries()) {
        bodyData = {
            "submitTime": Date.now(),
            "msisdn": userData.msisdn,
            "action": "played",
            "chargedAmount": "",
            "chargedProduct": "",
			"game":"duello",
			"channel":"hediye-havuzu"
        }
        response = await sendMarketingServiceData(bodyData);

        if (!response || response.body != 'Success') {
            isSuccess = false;
        }
    }
    
    await Bucket.data.patch(PAST_MATCHES_BUCKET, document._id, { is_success: isSuccess, marketing_response: JSON.stringify(response), marketing_request: JSON.stringify(bodyData) }).catch((e) => { console.log('PAST_MATCH'); console.log(e) })
}

export async function sendKafkaDataManually(req, res) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const db = await database().catch(console.error);
    const pastMatchesCollection = db.collection(`bucket_${PAST_MATCHES_BUCKET}`);
    const dateFilter = {
        $gte: new Date("2023-12-20T11:30:00Z"),
        $lte: new Date("2023-12-22T15:35:00Z")
    }
    const pastMatches = await pastMatchesCollection.find({
        end_time: dateFilter
    }).skip(650).limit(50).toArray();
    console.log("pastMatches: ",pastMatches.length);
    for (const data of pastMatches) {
        
        const usersIds = [data.user1]

        if (data.player_type == 0) {
            usersIds.push(data.user2)
        }
        const usersData = await getMsisdnsByUsersIds(usersIds);
        let isSuccess = true;
        let response = '';
        let bodyData = '';
        for (const userData of usersData) {
            bodyData = {
                "submitTime": Date.now(),
                "msisdn": userData.msisdn,
                "action": "played",
                "chargedAmount": "",
                "chargedProduct": "",
                "game": "4islem",
                "channel": "hediye-havuzu"
            }
            response = await sendMarketingServiceData(bodyData);

            if (!response || response.body != 'Success') {
                isSuccess = false;
            }
            await Bucket.data.patch(PAST_MATCHES_BUCKET, data._id, {
                is_success: isSuccess,
                marketing_response: JSON.stringify(response),
                marketing_request: JSON.stringify(bodyData)
            }).catch((e) => {
                console.log('PAST_MATCH');
                console.log(e);
            });
        }

    }
    return res.send('ok');
}

export async function onInsertedCharge(changed) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });
    const document = changed.document;
    

    if (!document.status) {
        return;
    }

    let isSuccess = true;
    const bodyData = {
        "submitTime": Date.now(),
        "msisdn": document.msisdn.substring(2),
        "action": "charged",
        "chargedAmount": CHARGE_AMOUNT,
        "chargedProduct": "",
		"game":"duello",
		"channel":"hediye-havuzu"
    }

    const response = await sendMarketingServiceData(bodyData);
    
    if (!response || response.body != 'Success') {
        isSuccess = false;
    }

    await Bucket.data.patch(CHARGE_LOGS_BUCKET, document._id, { is_success: isSuccess, marketing_response: JSON.stringify(response), marketing_request: JSON.stringify(bodyData) }).catch((e) => { console.log('CHARGE'); console.log(e) })
}

async function getMsisdnsByUsersIds(usersIds) {
    const usersData = [];
    const db = await database().catch(console.error);
    const userCollection = db.collection(`bucket_${USER_BUCKET}`);
    const identityCollection = db.collection(`identity`);

    for (const userId of usersIds) {
        const tempUser = await userCollection.findOne({ _id: ObjectId(userId) }).catch(console.error);
        if (tempUser) {
            const identityData = await identityCollection.findOne({ _id: ObjectId(tempUser.identity) });
            if (identityData) {
                usersData.push({
                    user_id: userId,
                    msisdn: identityData.attributes.msisdn
                })
            }
        }
    }

    return usersData;
}

async function sendMarketingServiceData(bodyData) {
    let response;
    try {
        await fetch("https://marketingservices.turkcell.com.tr/marketingServices/rest/GenericKafka/produce?topic=poly", {
            method: "post",
            body: JSON.stringify({
                ...bodyData
            }),
            headers: { "Content-Type": "application/json" }
        })
            .then(resTcell => resTcell.json())
            .then(data => { response = data })
    } catch (err) {
        console.log("ERROR : ", err)
        response = err
    }

    return response;
}

