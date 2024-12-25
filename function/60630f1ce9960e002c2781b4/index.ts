import * as Bucket from "@spica-devkit/bucket";
import * as Identity from "@spica-devkit/identity";

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const USER_POLICY = process.env.USER_POLICY;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;

export async function register(req, res) {
    console.log("@observer::register");
    const { mobile_number, name, url, avatar_color } = req.body;

    await createIdentity(mobile_number, createPassword(mobile_number))
        .then(async dataIdentity => {
            await addToUserBucket(dataIdentity.identity_id, name, url, avatar_color)
                .then(data => {
                    return res
                        .status(200)
                        .send({ message: "User registered successfully!", data: data });
                })
                .catch(error => {
                    return res.status(400).send({
                        message: "User added to identity. Error while adding User bucket",
                        error: error
                    });
                });
        })
        .catch(error => {
            return res.status(400).send({
                message: "Error while adding new Identity.",
                error: error
            });
        });
}

export async function login(req, res) {
    console.log("@observer::login");
    const { mobile_number } = req.body;

    await getIdentityToken(mobile_number, createPassword(mobile_number))
        .then(data => {
            return res.status(200).send(data);
        })
        .catch(error => {
            return res.status(400).send(error);
        });
}

async function getIdentityToken(mobile_number, password) {
    Identity.initialize({ apikey: `${SECRET_API_KEY}` });

    return new Promise(async (resolve, reject) => {
        await Identity.login(mobile_number, password)
            .then(data => {
                resolve({ token: data });
            })
            .catch(error => {
                console.log("--ERROR WHILE GETTING TOKEN");
                reject({ error: error });
            });
    });
}

// -identity operation
async function createIdentity(mobile_number, password) {
    let msisdn = msisdnGenerate(10);
    Identity.initialize({ apikey: `${SECRET_API_KEY}` });

    return new Promise(async (resolve, reject) => {
        await Identity.insert({
            identifier: mobile_number,
            password: password,
            policies: [`${USER_POLICY}`],
            // attributes: {}
            attributes: { msisdn: msisdn }
        })
            .then(identity => {
                resolve({ identity_id: identity._id, msisdn: msisdn });
            })
            .catch(error => {
                console.log("--ERROR WHILE CREATING IDENTITY: ", error);
                reject({ error: error });
            });
    });
}

function msisdnGenerate(length) {
    let result = "";
    let characters = "0123456789";
    let charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

async function addToUserBucket(identity_id, name, url, avatar_color) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });

    return new Promise(async (resolve, reject) => {
        await Bucket.data
            .insert(`${USER_BUCKET_ID}`, {
                identity: identity_id,
                name: name,
                profile_photo: url,
                avatar_color: avatar_color,
                total_point: 0,
                weekly_point: 0,
                win_count: 0,
                lose_count: 0,
                total_award: 0,
                weekly_award: 0,
                available_play_count: 50
            })
            .then(data => {
                resolve(data);
            })
            .catch(error => {
                console.log("--ERROR WHILE ADDING USER BUCKET: ", error);
                reject(error);
            });
    });
}

function createPassword(text) {
    let password = "a-" + text + "-a";
    return password;
}
