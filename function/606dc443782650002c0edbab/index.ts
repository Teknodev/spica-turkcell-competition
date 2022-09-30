import * as Bucket from "@spica-devkit/bucket";
import { database, close, ObjectId } from "@spica-devkit/database";
const jwt_decode = require("jwt-decode");
var jwt = require("jsonwebtoken");

const DUEL_BUCKET_ID = process.env.DUEL_BUCKET_ID;
const DUEL_ANSWERS_BUCKET_ID = process.env.DUEL_ANSWERS_BUCKET_ID;
const OPTIONS_BUCKET_ID = process.env.OPTIONS_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const PAST_DUELS_BUCKET_ID = process.env.PAST_DUELS_BUCKET_ID;

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
const SECRET_API_KEY = process.env.SECRET_API_KEY;
const AFKCHECKER_API_KEY = process.env.AFKCHECKER_API_KEY;

const REWARD_BUCKET_ID = process.env.REWARD_BUCKET_ID;

let db,
    duelsCollection,
    duelAnswersCollection,
    usersCollection,
    optionsCollection,
    identityCollection,
    rewardsCollection,
    pastDuelsCollection;

export async function answerQuestion(req, res) {
    const { duel_id, answer } = req.body;
    let token = getToken(req.headers.get("authorization"));

    let user_id;
    let answer_check;
    let userData;

    if (!db) {
        db = await database().catch(err => console.log("ERROR 2", err));
    }

    duelsCollection = db.collection(`bucket_${DUEL_BUCKET_ID}`);
    duelAnswersCollection = db.collection(`bucket_${DUEL_ANSWERS_BUCKET_ID}`);
    usersCollection = db.collection(`bucket_${USER_BUCKET_ID}`);
    optionsCollection = db.collection(`bucket_${OPTIONS_BUCKET_ID}`);
    pastDuelsCollection = db.collection(`bucket_${PAST_DUELS_BUCKET_ID}`);
    rewardsCollection = db.collection(`bucket_${REWARD_BUCKET_ID}`);
    identityCollection = db.collection(`identity`);

    let duel = await duelsCollection.findById(duel_id).catch(err => console.log("ERROR 3", err));
    let token_object = tokenVerified(token);

    if (token_object.error) {
        return res.status(401).send({ message: "Unauthorized" });
    }

    if (token == AFKCHECKER_API_KEY) {
        user_id = req.body.user_id;
    } else {
        let decoded_token = token_object.decoded_token;
        // let decoded_token = jwt_decode(token);
        let identity_id = decoded_token._id;
        userData = await getUser(identity_id).catch(err => console.log("ERROR 4", err));
        if (!userData._id) return res.status(400).send({ error: userData });
        user_id = userData._id.toString();
    }

    if (!duel) {
        return res.status(404).send({
            message: "ERROR! There is not any duel with this id."
        });
    }

    let questionsCount = await duelAnswersCollection
        .find({ duel: duel._id.toString() })
        .toArray()
        .catch(err => console.log("ERROR 10", err));

    const is_answered_data = await isQuestionAnswered(duel).catch(error => {
        console.log("ERROR 5", error);
        res.status(400).send({
            message: "ERROR! Error while getting Duel Answers!",
            error: error
        });
        return false;
    });

    let duel_answer;
    if (!is_answered_data.answered) {
        // - if none of users is answered before
        //1 - get right answer with using question id
        const right_option = await getRightOption(duel).catch(error => {
            console.log("ERROR 6", error);
            res.status(400).send({
                message: "ERROR! Error while getting right answers!",
                error: error
            });
            return false;
        });

        // 2 - create duel_answer object
        duel_answer = {
            duel: duel._id.toString(),
            question: duel.current_question,
            options: duel.options,
            correct_answer: right_option
        };

        // 3 - Check and manipulate the user is user1 or user2
        duel_answer = manipulateDuelAnswer(user_id, duel, answer, duel_answer);

        // Bot Opponent Handled
        answer_check = isAnswerRight(answer, right_option);
        if ((duel.duel_type == 1)) {
            let wrongAnswers = duel_answer.options.filter(option => option != right_option);
            let current_date = new Date();
            duel_answer.user2_answer_time = current_date;
            if (questionsCount.length < 4) {
                if (answer_check) {
                    // USER ANSWER CORRECT
                    duel_answer.user2_answer = right_option;
                } else {
                    // USER ANSWER INCORRECT
                    duel_answer.user2_answer =
                        wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
                }
            } else {
                duel_answer.user2_answer =
                    wrongAnswers[Math.floor(Math.random() * wrongAnswers.length)];
            }
        }

        // 4 - add this object to duel answers bucket
        await insertDuelAnswers(duel_answer).catch(error => {
            console.log("ERROR 7", error);
            res.status(400).send({
                message: "ERROR! Error while adding data to data answer bucket!",
                error: error
            });
            return false;
        });
    } else {
        // - if one of users is answered before

        // 1 - get right answer from duel answer object
        duel_answer = is_answered_data.duel_answer;

        // 2 - update duel_answer object, Check and manipulate the user is user1 or user2
        duel_answer = manipulateDuelAnswer(user_id, duel, answer, duel_answer);

        // 6 - update current_duel_answer to bucket
        await updateDuelAnswers(duel_answer).catch(error => {
            console.log("ERROR 9", error);
            res.status(400).send({
                message: "Can not insert duel answer object to Duel Answer Bucket",
                error: error
            });
            return false;
        });
    }


    // 3 - manipulate duel object, manipulate the user answers and corrent answer
    if(duel_answer)
        duel = isWinnerExist(duel_answer, duel);
    // 4 - update duel bucket -> add current_answer -> user1_answer -> user2_answer
    // console.log(duel);

    if (duel.hasOwnProperty("winner_of_current_question")) {
        await updateDuel(duel).catch(e => {
            console.log("ERROR 8", e);
            res.status(400).send({
                message: "Can not insert duel object to Duel Bucket",
                error: e
            });
            return false;
        });
    }

    if (userData) {
        await decreasePlayCount(duel, userData).catch(err => console.log("ERROR 28", err));
    }

    if (questionsCount.length == 50) {
        duel.winner_of_current_question = 1;
        await updateDuel(duel).catch(err => console.log("ERROR 11", err));
    }

    isMatchFinished(duel);
    // 7 - send repsonse to client => { answer_check : true | false }
    return res.status(200).send({
        answer_check: answer_check
    });
}

async function decreasePlayCount(duel, user) {
    let duelAnswers = await checkQuestionIndex(duel, user).catch(err =>
        console.log("ERROR 26", err)
    );
    if (duelAnswers.answersLength == 1) {
        if (user.bot == false) {
            let setQuery;
            if (user.free_play) {
                setQuery = { free_play: false };
            } else {
                setQuery = {
                    available_play_count: Math.max(Number(user.available_play_count) - 1, 0)
                };
            }

            await usersCollection
                .findOneAndUpdate(
                    { _id: ObjectId(user._id) },
                    {
                        $set: setQuery
                    }
                )
                .catch(err => console.log("ERROR 25: ", err));
        }
    }

    return true;
}

async function checkQuestionIndex(duel, user) {
    let query = { duel: String(duel._id) };
    if (duel.user1 == user._id.toString()) {
        query["user1_answer"] = { $ne: "" };
    } else {
        query["user2_answer"] = { $ne: "" };
    }

    const duelAnswers = await duelAnswersCollection
        .find(query)
        .toArray()
        .catch(err => console.log("ERROR 23: ", err));

    let result = { answersLength: duelAnswers.length };
    return result;
}

async function isMatchFinished(duel) {
    let duelId = duel._id.toString();
    let questionsCount = await duelAnswersCollection
        .find({ duel: duel._id.toString() })
        .toArray()
        .catch(err => console.log("ERROR 12", err));

    if (questionsCount.length == 50) {
        duel.winner_of_current_question = 1;
    }

    if (
        duel.winner_of_current_question == 1 ||
        duel.winner_of_current_question == 2 ||
        questionsCount.length == 50
    ) {
        await duelsCollection
            .findOneAndUpdate(
                { _id: ObjectId(duel._id) },
                {
                    $set: {
                        is_finished: true,
                        winner_score: questionsCount.length
                    }
                }
            )
            .catch(err => console.log("ERROR 13", err));

        let answers = await duelAnswersCollection
            .find({ duel: duelId })
            .toArray()
            .catch(err => console.log("ERROR 14", err));

        const user1 = await usersCollection
            .findOne({ _id: ObjectId(duel.user1) })
            .catch(err => console.log("ERROR 15", err));
        const user2 = await usersCollection
            .findOne({ _id: ObjectId(duel.user2) })
            .catch(err => console.log("ERROR 16", err));

        let player_type = 0;
        if (user1.bot || user2.bot) {
            player_type = 1;
        }

        let user1EarnedPoints = 0;
        let user2EarnedPoints = 0;
        let user1EarnedAward = 0;
        let user2EarnedAward = 0;
        for (let answer of answers) {
            if (answer.correct_answer == answer.user1_answer && !user1.bot) {
                user1EarnedPoints += 10;
            }
            if (answer.correct_answer == answer.user2_answer && !user2.bot) {
                user2EarnedPoints += 10;
            }
        }
        if (duel.winner_of_current_question == 1) {
            if (!user1.bot) {
                user1.win_count += 1;
                user1EarnedAward += duel.user1_is_free ? 1 : 3;
                user1EarnedPoints += 100;
                user1.elo += 25;
            }
            if (!user2.bot) {
                user2EarnedAward += duel.user2_is_free ? 0 : 2;
                user2.lose_count += 1;
                user2.elo = Math.max(user2.elo - 25, 0);
            }
        } else if (duel.winner_of_current_question == 2) {
            if (!user2.bot) {
                user2.win_count += 1;
                user2EarnedAward += duel.user2_is_free ? 1 : 3;
                user2EarnedPoints += 100;
                user2.elo += 25;
            }

            if (!user1.bot) {
                user1.lose_count += 1;
                user1EarnedAward += duel.user1_is_free ? 0 : 2;
                user1.elo = Math.max(user1.elo - 25, 0);
            }
        }

        const pastMatch = await pastDuelsCollection
            .insertOne({
                duel_id: duelId,
                name: user1.name + " vs " + user2.name,
                user1: duel.user1,
                user2: duel.user2,
                questions: answers.map(answer => JSON.stringify(answer)),
                winner: duel.winner_of_current_question,
                start_time: ObjectId(duelId).getTimestamp(),
                end_time: new Date(),
                player_type: player_type,
                points_earned: user1EarnedPoints + user2EarnedPoints,
                user1_is_free: duel.user1_is_free,
                user2_is_free: duel.user2_is_free
            })
            .catch(err => console.log("ERROR 17", err));

        // Update users point --->
        usersCollection.findOneAndUpdate(
            {
                _id: ObjectId(duel.user1)
            },
            {
                $set: {
                    total_point: parseInt(user1.total_point) + user1EarnedPoints,
                    weekly_point: user1.weekly_point + user1EarnedPoints,
                    win_count: user1.win_count,
                    lose_count: user1.lose_count,
                    total_award: parseInt(user1.total_award) + user1EarnedAward,
                    weekly_award: (user1.weekly_award || 0) + user1EarnedAward,
                    elo: user1.elo
                }
            }
        );
        usersCollection.findOneAndUpdate(
            {
                _id: ObjectId(duel.user2)
            },
            {
                $set: {
                    total_point: parseInt(user2.total_point) + user2EarnedPoints,
                    weekly_point: user2.weekly_point + user2EarnedPoints,
                    win_count: user2.win_count,
                    lose_count: user2.lose_count,
                    total_award: parseInt(user2.total_award) + user2EarnedAward,
                    weekly_award: (user2.weekly_award || 0) + user2EarnedAward,
                    elo: user2.elo
                }
            }
        );
        // Update users point end <---

        let date = new Date();
        date.setMinutes(date.getMinutes() - 3);

        if (!user1.bot) {
            let user1Msisdn = await identityCollection
                .findOne({ _id: ObjectId(user1.identity) })
                .catch(err => console.log("ERROR 35", err));
            user1Msisdn = user1Msisdn ? user1Msisdn.attributes.msisdn : "";

            const rewards = await rewardsCollection
                .findOne({
                    date: { $gte: date },
                    msisdn: `90${user1Msisdn}`,
                    match_id: ""
                })
                .catch(err => console.log("ERROR 33", err));

            if (rewards) {
                await rewardsCollection
                    .updateOne(
                        { _id: ObjectId(rewards._id) },
                        {
                            $set: {
                                match_id: pastMatch.ops[0]._id
                            }
                        }
                    )
                    .catch(err => console.log("ERROR 34", err));
            }
        }

        if (!user2.bot) {
            let user2Msisdn = await identityCollection
                .findOne({ _id: ObjectId(user2.identity) })
                .catch(err => console.log("ERROR 36", err));
            user2Msisdn = user2Msisdn ? user2Msisdn.attributes.msisdn : "";

            const rewards = await rewardsCollection
                .findOne({
                    date: { $gte: date },
                    msisdn: `90${user2Msisdn}`,
                    match_id: ""
                })
                .catch(err => console.log("ERROR 37", err));

            if (rewards) {
                await rewardsCollection
                    .updateOne(
                        { _id: ObjectId(rewards._id) },
                        {
                            $set: {
                                match_id: pastMatch.ops[0]._id
                            }
                        }
                    )
                    .catch(err => console.log("ERROR 38", err));
            }
        }
    }
}

// get user with identity id
async function getUser(identity_id) {
    return await usersCollection
            .findOne({ identity: identity_id });
}

// is this question in duel answered by other user or not
async function isQuestionAnswered(duel) {
    return new Promise(async (resolve, reject) => {
        await duelAnswersCollection
            .find({
                duel: duel._id.toString(),
                question: duel.current_question
            })
            .toArray()
            .then(data => {
                if (data.length > 0) {
                    //answered
                    resolve({
                        answered: true,
                        duel_answer: data[0]
                    });
                } else {
                    // not answered
                    resolve({
                        answered: false
                    });
                }
            })
            .catch(err => console.log("ERROR 19", err));
    });
}

// get right option of the question
async function getRightOption(duel) {
    Bucket.initialize({ apikey: `${SECRET_API_KEY}` });

    let question_id = duel.current_question;

    return new Promise(async (resolve, reject) => {
        await optionsCollection
            .find({
                question: question_id.toString(),
                is_right: true
            })
            .toArray()
            .then(data => {
                if (data[0]) {
                    resolve(data[0].option);
                } else {
                    reject({
                        error:
                            "There is not any answer or right answer with this question id in answers bucket."
                    });
                }
            })
            .catch(error => {
                console.log("ERROR 20", error);
                reject(error);
            });
    });
}

// manipulate
function manipulateDuelAnswer(user_id, duel, answer, duel_answer) {
    let is_user1;
    if (duel.user1 == user_id) {
        is_user1 = true;
    } else {
        is_user1 = false;
    }

    let current_date = new Date();

    if (is_user1) {
        duel_answer.user1_answer = answer;
        duel_answer.user1_answer_time = current_date;
    } else {
        duel_answer.user2_answer = answer;
        duel_answer.user2_answer_time = current_date;
    }

    return duel_answer;
}

// manipulate -> add user answer to duel_answer object properly
function isWinnerExist(current_duel_answer, duel) {
    // update-current answer, user1_answer, user2_answer
    duel.user1_answer = current_duel_answer.user1_answer;
    duel.user2_answer = current_duel_answer.user2_answer;
    duel.current_answer = current_duel_answer.correct_answer;
    if (duel.hasOwnProperty("user1_answer") && duel.hasOwnProperty("user2_answer") && duel.user1_answer != undefined && duel.user2_answer != undefined) {
        // update winner_of_current_question state
        let winner_of_current_question = 0;
        if (
            isAnswerRight(duel.user1_answer, duel.current_answer) &&
            isAnswerRight(duel.user2_answer, duel.current_answer)
        ) {
            winner_of_current_question = 3;
        } else if (
            isAnswerRight(duel.user1_answer, duel.current_answer) &&
            !isAnswerRight(duel.user2_answer, duel.current_answer)
        ) {
            winner_of_current_question = 1;
        } else if (
            !isAnswerRight(duel.user1_answer, duel.current_answer) &&
            isAnswerRight(duel.user2_answer, duel.current_answer)
        ) {
            winner_of_current_question = 2;
        } else {
            winner_of_current_question = 0;
        }
        duel.winner_of_current_question = winner_of_current_question;
    }

    return duel;
}

// insert duel_answer object to Duel_Answer bucket
async function insertDuelAnswers(duel_answer) {
    return new Promise(async (resolve, reject) => {
        await duelAnswersCollection
            .insertOne(duel_answer)
            .then(data => {
                resolve(data);
            })
            .catch(error => {
                console.log("ERROR 21", error);
                reject(error);
            });
    });
}

// update duel_answer object in Duel_Answer bucket
async function updateDuelAnswers(duel_answer) {
    return new Promise(async (resolve, reject) => {
        await duelAnswersCollection
            .findOneAndReplace({ _id: ObjectId(duel_answer._id) }, duel_answer, {
                returnOriginal: false
            })
            .then(data => {
                resolve(data.value);
            })
            .catch(error => {
                console.log("ERROR 22", error);
                reject(error);
            });
    });
}

// -----UPDATE TEST
// Replace duel object to duel bucket
async function updateDuel(duel) {
    return new Promise(async (resolve, reject) => {
        await duelsCollection
            .findOneAndReplace({ _id: ObjectId(duel._id) }, duel, {
                returnOriginal: false
            })
            .then(data => {
                resolve(data.value);
            })
            .catch(error => {
                console.log("ERROR 23", error);
                reject(error);
            });
    });
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

function tokenVerified(token) {
    let response_object = {
        error: false
    };
    let decoded = "";

    if (token != AFKCHECKER_API_KEY) {
        try {
            decoded = jwt.verify(token, `${JWT_SECRET_KEY}`);

            response_object.decoded_token = decoded;
        } catch (err) {
            response_object.error = true;
        }
    }

    return response_object;
}

function isAnswerRight(answer, right_option) {
    return answer === right_option;
}
