import * as Bucket from "@spica-devkit/bucket";
const fetch = require("node-fetch");
const crypto = require("crypto");
const TCELL_ADMIN_BUCKET_INSERT_APIKEY = process.env.TCELL_ADMIN_BUCKET_INSERT_APIKEY;

export async function newUserTcellAdminInsert(msisdn) {
    const newUserResponse = await controlNewUser(msisdn);
    if (newUserResponse == 2) return;
    console.log("@NewUser!!!", msisdn);
    Bucket.initialize(
        {
            apikey: TCELL_ADMIN_BUCKET_INSERT_APIKEY,
            publicUrl: 'https://tcell-admin-3c220.hq.spicaengine.com/api'
        }
    )

    const data = {
        msisdn: msisdn,
        created_at: new Date(),
        available_play: 2,
        game: "duello"
    }

    Bucket.data.insert('66faa88925c85f002baffddf', data)
        .catch((error) => {
            console.log("New system error: ", error);
        });

    return;
}

async function controlNewUser(msisdn) {
    const SHARED_SECRET = 'GYh7fU+2@yseY+!7!B5xsq_!Fftf7bYJ';
    let jsonData = {
        "ApiClientKey": "P8NYyNKeMHf9SVxVGZ5G2RFkeyB64H7Y",
        "ApiClientSecret": "J7vqVT2s6fxPmYJA8qyRYaSRysr4kazs",
        "Timestamp": Math.floor((new Date().getTime() / 1000))
    }

    let hash = encryptAESGCM(SHARED_SECRET, jsonData)

    const body = {
        "OfferId": 6671,
        "Action": "CheckCustomer",
        "Msisdn": msisdn
    }

    let response;
    try {
        await fetch("https://api.dnatech.io/v1/Code", {
            method: "post",
            body: JSON.stringify({
                ...body
            }),
            headers: { "Content-Type": "application/json", "Authorization": hash }
        })
            .then(resTcell => resTcell.json())
            .then(data => { response = data })
    } catch (err) {
        console.log("ERROR : ", err)
        response = err
    }
    const parsedResponse = JSON.parse(JSON.stringify(response));
    const returnCode = parsedResponse.Data.ReturnCode;
    return returnCode;
}

function encryptAESGCM(key, message) {
    message = JSON.stringify(message);
    try {
        if (key.length != 32)
            throw new Error("invalid key, must be 32 char");

        const IV = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv("aes-256-gcm", key, IV);
        let encrypted = cipher.update(message, "utf8", "hex");
        encrypted += cipher.final("hex");
        const tag = cipher.getAuthTag();
        return tobase64(
            tobuffer(IV.toString("hex") + encrypted + tag.toString("hex"))
        );
    } catch (ex) {
        console.error(ex);
    }
}

function tobuffer(str) {
    str = str.replace(/^0x/, "");
    if (str.length % 2 != 0) {
        console.log(
            "WARNING: expecting an even number of characters in the string"
        );
    }
    var bad = str.match(/[G-Z\s]/i);
    if (bad) {
        console.log("WARNING: found non-hex characters", bad);
    }
    var pairs = str.match(/[\dA-F]{2}/gi);
    var integers = pairs.map(function (s) {
        return parseInt(s, 16);
    });
    var array = new Uint8Array(integers);
    var props = new Uint8Array([16, 16]);
    var response = Buffer.concat([props, array]);
    return response;
};

function tobase64(str) {
    return Buffer.from(str, "utf8").toString("base64");
};