import * as Bucket from "@spica-devkit/bucket";
import { database, close, ObjectId } from "@spica-devkit/database";
const fetch = require("node-fetch");
var jwt = require("jsonwebtoken");
import * as Identity from "@spica-devkit/identity";

const DUEL_BUCKET_ID = process.env.DUEL_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const CONFIGURATION_BUCKET_ID = process.env.CONFIGURATION_BUCKET_ID;
const DUEL_ANSWERS_BUCKET_ID = process.env.DUEL_ANSWERS_BUCKET_ID;
const QUESTION_BUCKET_ID = process.env.QUESTION_BUCKET_ID;
const OPTIONS_BUCKET_ID = process.env.OPTIONS_BUCKET_ID;

const SECRET_API_KEY = process.env.SECRET_API_KEY;


let db;

export async function nextQuestion(req, res) {
    if (!db) {
        db = await database().catch(err => console.log("ERROR 2", err));
    }
    const { duel_id } = req.body;
    // token
    let token = getToken(req.headers.get("authorization"));

    let token_object = await tokenVerified(token);

    // token verified or not
    if (token_object.error == false) {
        let decoded_token = token_object.decoded_token;
        let identity_id = decoded_token._id;
        // get the data of duel that user in
        await getDuel(duel_id)
            .then(async duel => {
                // can update duel or not(maybe another user updated it before this user)
                if (canUpdateDuel(duel)) {
                    // get user data with using identity id
                    await getUserWithIdentityID(identity_id)
                        .then(async user => {
                            // is user try to change own duel question or not
                            if (duel.user1 == user._id.toString() || duel.user2 == user._id.toString()) {
                                // find the perfect question for the duel and get it with its options
                                let question_id, options;

                                let x = await getQuestionWithOptions(duel).catch(err =>
                                    console.log("ERROR 3", err)
                                );
                                question_id = x.question_id;
                                options = x.options;

                                let temp_options = JSON.parse(JSON.stringify(options));
                                duel = manipulateDuel(question_id, temp_options, duel);

                                //update duel in bucket
                                await updateDuel(duel)
                                    .then(data => {
                                        return res.status(200).send({
                                            message:
                                                "The question successfully."
                                        });
                                    })
                                    .catch(error => {
                                        console.log("ERROR 10", error);
                                        res.status(400).send({
                                            message: "ERROR! Error while updating duel object",
                                            error: error
                                        });
                                    });
                            }
                        })
                        .catch(error => {
                            console.log("ERROR 3", error);
                            return res.status(400).send({ message: "1", error: error });
                        });
                } else {
                    return res
                        .status(200)
                        .send({ message: "The question has been updated by another user." });
                }
            })
            .catch(error => {
                console.log("ERROR 25", error);
                return res.status(400).send({ message: "2", error: error });
            });
    } else {
        return res.status(401).send({ message: "Unauthorized" });
    }
}

// function tokenVerified(token) {
//     /* -request object
//         error: true | false,
//         decoded_token: token
//      */

//     let response_object = {
//         error: false
//     };

//     let decoded = "";

//     try {
//         decoded = jwt.verify(token, `${JWT_SECRET_KEY}`);

//         response_object.decoded_token = decoded;
//     } catch (err) {
//         console.log("error", err);
//         response_object.error = true;
//     }

//     return response_object;
// }
async function tokenVerified(token) {
    let response_object = {
        error: false
    };

    Identity.initialize({ apikey: `${SECRET_API_KEY}` });
    const decoded = await Identity.verifyToken(token).catch(err => (response_object.error = true));
    response_object.decoded_token = decoded;

    return response_object;
}

// duel has question or not (if have question -> it is updated by other user)
function canUpdateDuel(duel) {
    let response = false;

    if (!duel.is_finished) {
        if (duel.current_question == undefined) {
            response = true;
        } else if (
            duel.current_answer != undefined &&
            duel.winner_of_current_question != undefined
        ) {
            response = true;
        }
    }

    return response;
}

// get duel with duel _id
async function getDuel(duel_id) {
    return new Promise(async (resolve, reject) => {
        await db
            .collection(`bucket_${DUEL_BUCKET_ID}`)
            .findById(duel_id)
            .then(data => {
                if (data) {
                    resolve(data);
                } else {
                    console.log(
                        "ERROR! Can not find any duel with this duel id. Duel ID:",
                        duel_id
                    );
                    reject({ error: "ERROR! Can not find any duel with this duel id" });
                }
            })
            .catch(error => {
                console.log("ERROR 18: ", error);
                reject({ error: error });
            });
    });
}

// -----UPDATE TEST
// update duel in bucket
async function updateDuel(updated_duel) {
    return new Promise(async (resolve, reject) => {
        db.collection(`bucket_${DUEL_BUCKET_ID}`)
            .findOneAndReplace({ _id: ObjectId(updated_duel._id) }, updated_duel, {
                returnOriginal: false
            })
            .then(data => {
                if (data.value) {
                    resolve(data.value);
                } else {
                    console.log("ERROR! Can not update duel.", data);
                    reject({ error: "ERROR! Can not update duel." });
                }
            })
            .catch(error => {
                reject({ error: error });
            });
    });
}

// get perfect question for the duel
async function getQuestionWithOptions(duel) {
    // for how many times trying to get unique question
    let question_get_iteration = 5;
    let question;
    let options;

    let configuration = await db
        .collection(`bucket_${CONFIGURATION_BUCKET_ID}`)
        .findOne({ key: "question_level_system" })
        .catch(err => console.log("ERROR 19: ", err));
    
    /*
    let configuration = await Bucket.data
        .getAll(`${CONFIGURATION_BUCKET_ID}`, {
            queryParams: { filter: { key: "question_level_system" } }
        })
        .then(data => data[0]);
    */
    
    let duel_answers = await db
        .collection(`bucket_${DUEL_ANSWERS_BUCKET_ID}`)
        .find({ duel: duel._id.toString() })
        .toArray()
        .catch(err => console.log("ERROR 20: ", err));
    
    let question_level = JSON.parse(configuration.value);
    let required_level = getRequiredLevel(question_level, duel_answers);
    // let required_level = 1;

    //1 - get a question for the according required level
    let questions;
    await getQuestionForLevel(required_level)
        .then(data => (questions = data))
        .catch(err => console.log("ERROR 21: ", err));

    //2 - check duplicate
    /* -flow
        1 - if there is questions
        2 - loop while duplicate_question_detected will be false
        3 - it will loop max question_get_iteration(5) times
        4 - get a random question -> if it is duplicate(asked in this duel before) -> just decrease the iteration -> get another random question
        5 - if it is not duplicate -> make duplicate_question_detected false -> while will stop
     */

    if (questions) {
        let duplicate_question_detected = true;
        while (duplicate_question_detected) {
            // if it is last time to get unique question and it fails
            if (question_get_iteration == 0) {
                duplicate_question_detected = false;
            } else {
                question = getRandomlyOne(questions);

                // check this question asked before or not
                if (checkDuplicateQuestion(question, duel_answers) == true) {
                    question_get_iteration--;
                } else {
                    // question is not asked before -> stop the loop
                    duplicate_question_detected = false;
                }
            }
        }
    }

    //3 - get options for this question
    if (question) {
        // options = await Bucket.data.getAll(`${OPTIONS_BUCKET_ID}`, {
        options = await db
            .collection(`bucket_605c98e2e9960e002c27819a`)
            .find({ question: question._id.toString() })
            .toArray()
            .catch(err => console.log("ERROR 22: ", err));
        
        options = manipulateOptions(options);
    }
    
    return {
        question_id: question._id.toString(),
        options: options
    };
}

function getRequiredLevel(question_level, asked_question) {
    let level;

    if (asked_question.length < question_level.easy) {
        level = 1;
    } else if (asked_question.length < question_level.medium) {
        level = 2;
    } else {
        level = 3;
    }

    return level;
}

async function getQuestionForLevel(level) {
    return new Promise(async (resolve, reject) => {
        db.collection(`bucket_${QUESTION_BUCKET_ID}`)
            .find({ level: level })
            .toArray()
            .then(data => resolve(data))
            .catch(error => reject(error));
    });
}

function getRandomlyOne(my_array) {
    var random_one = my_array[Math.floor(Math.random() * my_array.length)];

    return random_one;
}

function checkDuplicateQuestion(question, duel_answers) {
    let is_duplicate = false;

    let a = duel_answers.find(duel_answer => {
        return duel_answer.question === question._id.toString();
    });

    if (a != undefined) {
        is_duplicate = true;
    }

    return is_duplicate;
}

function manipulateOptions(options) {
    // 1- get right options
    let right_option = options.find(option => {
        return option.is_right == true;
    });

    if (!right_option) {
        console.log("There is no right option for this question", options);
    }

    // 2- extract right option from options
    options = removeObject(right_option, options);

    // 3- shuffle and get first 3 elements
    options = shuffle(options);
    options = options.slice(0, 3);

    // 4- add right option and shuffle
    options.push(right_option);
    options = shuffle(options);

    // 5- get options just as string
    options = getOptionsAsText(options);

    return options;
}

function manipulateDuel(question_id, options, latest_duel) {
    latest_duel.current_question = question_id.toString();
    latest_duel.options = options;

    latest_duel["user1_is_free"] = latest_duel.user1_is_free;
    latest_duel["user2_is_free"] = latest_duel.user2_is_free;

    delete latest_duel.current_answer;
    delete latest_duel.user1_answer;
    delete latest_duel.user2_answer;
    delete latest_duel.winner_of_current_question;

    let current_date = new Date();
    latest_duel.last_question_date = current_date;

    return latest_duel;
}

// get user with identity id
async function getUserWithIdentityID(identity_id) {
    return new Promise(async (resolve, reject) => {
        await db
            .collection(`bucket_${USER_BUCKET_ID}`)
            .findOne({ identity: identity_id })
            .then(data => {
                if (data) {
                    resolve(data);
                } else {
                    console.log("ERROR! Can not find any user with this identity");
                    reject({ error: "ERROR! Can not find any user with this identity" });
                }
            })
            .catch(error => {
                console.log("ERROR 12", error);
                reject(error);
            });
    });
}

//  ---------HELPER FUNCTIONS---------
function getToken(token) {
    if (token) {
        token = token.split(" ")[1];
    } else {
        token = "";
    }

    return token;
}

function removeObject(object, array) {
    let index = getIndexOfObject(object, array);
    if (index != -1) {
        array.splice(index, 1);
    }

    return array;
}

function getIndexOfObject(object, array) {
    var index = array
        .map(function(item) {
            return item._id;
        })
        .indexOf(object._id);

    return index;
}

function shuffle(array) {
    var currentIndex = array.length,
        temporaryValue,
        randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {
        // Pick a remaining element...
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex -= 1;

        // And swap it with the current element.
        temporaryValue = array[currentIndex];
        array[currentIndex] = array[randomIndex];
        array[randomIndex] = temporaryValue;
    }

    return array;
}

function getOptionsAsText(options) {
    options = options.map(option => option.option);
    return options;
}
