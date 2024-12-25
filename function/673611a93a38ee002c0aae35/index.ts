import * as Api from "../../67361a623a38ee002c0ab5bf/.build";
import { database } from "@spica-devkit/database";

const axios = require("axios");
const { DOMParser } = require('xmldom');
var convert = require("xml-js");


const SINGLEPLAY_PAST_MATCHES = process.env.SINGLEPLAY_PAST_MATCHES;
const CORRUPTED_SINGLEPLAY_PAST_MATCHES = process.env.CORRUPTED_SINGLEPLAY_PAST_MATCHES;
const USER_BUCKET = process.env.USER_BUCKET;
const SINGLEPLAY_DUEL_QUEUE = process.env.SINGLEPLAY_DUEL_QUEUE;
const SINGLEPLAY_DUEL_COUNT = process.env.SINGLEPLAY_DUEL_COUNT;
const SINGLEPLAY_BUGGED_GAMES = process.env.SINGLEPLAY_BUGGED_GAMES;
const REWARDS_BUCKET_ID = process.env.REWARDS_BUCKET_ID;
const BUGGED_REWARDS_BUCKET_ID = process.env.BUGGED_REWARDS_BUCKET_ID;

const CryptoJS = require("crypto-js");

const TCELL_USERNAME = 400026758;
const TCELL_PASSWORD = 400026758;
const CHARGE_VARIANT = 207340;

const OFFER_ID_1GB = 481642;
const CAMPAIGN_ID_1GB = 1236;

function hashData(data) {
    const dataString = JSON.stringify(data);
    const hashed = CryptoJS.SHA3(dataString).toString(CryptoJS.enc.Hex);
    return hashed;
}

export async function singleplayPastMatchOperation(doc) {
    const data = doc.current;
    const requestBody = { ...data };
    delete requestBody.hashed_data
    delete requestBody._id
    const { created_at, finished_at, user_actions, is_paid, user, is_win } = requestBody;
    const hashed = await hashData(requestBody);
    const userObj = await Api.getOne(USER_BUCKET, { _id: Api.toObjectId(user) })

    if (!userObj) {
        console.log("No user found!")
        return;
    }
    if (hashed != data.hashed_data) {
        await Api.insertOne(CORRUPTED_SINGLEPLAY_PAST_MATCHES, {
            name: userObj.name,
            user: String(userObj._id),
            created_at: new Date(),
            duel_object: data
        })
        console.error("Corrupted Game Detected!! ");
        return
    } else {
        const actions = JSON.parse(user_actions);

        const earnedPoint = actions.filter(action => action.is_right).length * 10;

        const userActions = actions.map(action => JSON.stringify(action));
        await Api.insertOne(SINGLEPLAY_PAST_MATCHES, {
            name: userObj.name,
            user: String(userObj._id),
            user_point: earnedPoint,
            user_actions: userActions,
            start_time: new Date(created_at),
            end_time: new Date(finished_at) || new Date(),
            user_is_free: !is_paid,
            is_win: is_win
        })
        let userEarnedAward = is_paid ? (is_win ? 2 : 1) : 0;

        is_win ? userObj.win_count++ : userObj.lose_count++;
        //Todo 
        Api.updateOne(USER_BUCKET, {
            _id: userObj._id
        }, {
            $set: {
                total_point: parseInt(userObj.total_point) + earnedPoint,
                weekly_point: userObj.weekly_point + earnedPoint,
                win_count: userObj.win_count,
                lose_count: userObj.lose_count,
                total_award: parseInt(userObj.total_award) + userEarnedAward,
                weekly_award: (userObj.weekly_award || 0) + userEarnedAward,
            }
        })
    }

    await Api.deleteOne(SINGLEPLAY_DUEL_QUEUE, {
        _id: Api.toObjectId(data._id)
    })

    return;
}

export async function getWinnerSingleplay(doc) {
    const userMatchData = doc.document;
    console.log("userMatchData: ", userMatchData);
    if (userMatchData.is_win && !userMatchData.user_is_free) {
        console.log("@winner!")
        const msisdn = await getUserMsisdn(userMatchData.user);
        setAward(msisdn, userMatchData._id);
    }
}

async function setAward(msisdn, matchId) {

    const sessionId = await sessionSOAP(TCELL_USERNAME, TCELL_PASSWORD, CHARGE_VARIANT);
    if (!sessionId) { return false }

    await setAwardSOAP(sessionId, msisdn, OFFER_ID_1GB, CAMPAIGN_ID_1GB, matchId, 'match');
    return;
}


async function getUserMsisdn(user) {
    const db = await Api.useDatabase();
    const identityCollection = db.collection(`identity`);

    let msisdn;

    const userData = await Api.getOne(USER_BUCKET, { _id: Api.toObjectId(user) })

    const userIdentity = await identityCollection
        .findOne({ _id: Api.toObjectId(userData.identity) })
        .catch(err => console.log("ERROR 25 ", err));

    msisdn = userIdentity.attributes.msisdn;

    return msisdn;
}

export function deleteFinishedDuels() {
    const date = new Date();
    date.setMinutes(date.getMinutes() - 2);

    Api.deleteMany(SINGLEPLAY_DUEL_COUNT, {
        created_at: { $lte: date }
    });
}

export async function buggedUsersHandle() {
    try {
        const date = new Date();
        date.setMinutes(date.getMinutes() - 5);

        const matchData = await Api.getMany(SINGLEPLAY_DUEL_QUEUE, { finished_at: { $lte: date } });

        if (matchData && matchData.length > 0) {
            await Api.insertMany(SINGLEPLAY_BUGGED_GAMES, matchData);

            await Api.deleteMany(SINGLEPLAY_DUEL_QUEUE, { finished_at: { $lte: date } });
        }
    } catch (error) {
        console.error("Error handling bugged users:", error);
    }
}

//Tcell functions
async function sessionSOAP(spUsername, password, serviceVariantId) {
    let soapEnv = `<?xml version="1.0" encoding="UTF-8"?>
    <soap:Envelope xmlns:mrns0="urn:SPGW" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
            <mrns0:createSession>
                <spId>${spUsername}</spId>
                <serviceVariantId>${serviceVariantId}</serviceVariantId>
                <password>${password}</password>
            </mrns0:createSession>
        </soap:Body>
    </soap:Envelope>`;

    return await axios
        .post("https://sdp.turkcell.com.tr/spgw/services/AuthenticationPort", soapEnv, {
            headers: {
                "Content-Type": "text/xml",
                soapAction: "add"
            }
        })
        .then(res => {
            // let dom = new jsdom.JSDOM(res.data);
            // let sessionId = dom.window.document.querySelector("sessionId").textContent;
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(res.data, "text/xml");
            const sessionIdElement = xmlDoc.getElementsByTagName("sessionId")[0];
            let sessionId = sessionIdElement.textContent;
            if (sessionId) {
                return sessionId;
            } else return false;
        })
        .catch(err => {
            console.log("ERROR 8", err);
            return false;
        });
}

async function setAwardSOAP(sessionID, msisdn, offerId, campaignId, matchId = "", type, cgannelId = 514) {
    const db = await database().catch(err => console.log("ERROR 27", err));
    let soapEnv = `<soap:Envelope xmlns:soap = "http://schemas.xmlsoap.org/soap/envelope/">
    <soap:Header>
        <ns4:token
            xmlns:ns4 = "http://sdp.turkcell.com.tr/mapping/generated"
            xmlns:ns3 = "http://extranet.turkcell.com/ordermanagement/processes/serviceordermanagement/ServiceOrderManagement_v1.0"
            xmlns:ns2 = "http://extranet.turkcell.com/ordermanagement/processes/serviceordermanagement/ServiceOrderManagementTypes">
            <sessionId>${sessionID}</sessionId>
        </ns4:token>
    </soap:Header>
    <soap:Body>
        <ns2:CreateOrderRequest
            xmlns:ns2 = "http://extranet.turkcell.com/ordermanagement/processes/serviceordermanagement/ServiceOrderManagementTypes"
            xmlns:ns3 = "http://extranet.turkcell.com/ordermanagement/processes/serviceordermanagement/ServiceOrderManagement_v1.0"
            xmlns:ns4 = "http://sdp.turkcell.com.tr/mapping/generated">
            <ns2:header>
                <ns2:channelApplication>
                    <ns2:channelId>${cgannelId}</ns2:channelId>
                </ns2:channelApplication>
            </ns2:header>
            <ns2:orderLine>
                <ns2:msisdn>${msisdn}</ns2:msisdn>
                <ns2:orderLineItem>
                    <ns2:offerId>${offerId}</ns2:offerId>
                    <ns2:campaignId>${campaignId}</ns2:campaignId>
                    <ns2:action>1</ns2:action>
                </ns2:orderLineItem>
            </ns2:orderLine>
        </ns2:CreateOrderRequest>
    </soap:Body>
    </soap:Envelope>`;

    return await axios
        .post("https://sdp.turkcell.com.tr/proxy/external/ServiceOrderManagement", soapEnv, {
            headers: {
                "Content-Type": "text/xml",
                soapAction:
                    "http://sdp.turkcell.com.tr/services/action/ServiceOrderManagement/createOrder"
            }
        })
        .then(async res => {
            let content = JSON.parse(convert.xml2json(res.data, { compact: true, spaces: 4 }));

            if (content["S:Envelope"]["S:Body"]["ns1:ServiceOrderManagementResponse"]) {
                let result = content["S:Envelope"]["S:Body"]["ns1:ServiceOrderManagementResponse"];
                let status = result["line"]["lineItem"]["businessInteraction"];
                let rewardData = {
                    order_id: parseInt(result["ns1:orderId"]["_text"]),
                    offer_id: parseInt(result["line"]["lineItem"]["offerId"]["_text"]),
                    date: new Date(),
                    error_id: status ? status["error"]["errorId"]["_text"] : "",
                    user_text: status ? status["error"]["userText"]["_text"] : "",
                    status: status ? false : true,
                    result: res.data,
                    match_id: matchId || "",
                    type: type || "",
                    msisdn: result["line"]["identifierForLineOfferId"]["_text"]
                };

                if (rewardData.status) {
                    await db
                        .collection("bucket_" + REWARDS_BUCKET_ID)
                        .insertOne(rewardData)
                        .catch(err => console.log("ERROR 28: ", err));
                } else {
                    await db
                        .collection("bucket_" + BUGGED_REWARDS_BUCKET_ID)
                        .insertOne(rewardData)
                        .catch(err => console.log("ERROR 40: ", err));
                }
            }

            /*let result = JSON.parse(convert.xml2json(res.data, { compact: true, spaces: 4 }));
            let businessInteraction =
                result["S:Envelope"]["S:Body"]["ns1:ServiceOrderManagementResponse"]["line"][
                    "lineItem"
                ]["businessInteraction"];*/
            return res.data;
        })
        .catch(err => {
            console.log("ERROR 29", err);
            return err;
        });
}