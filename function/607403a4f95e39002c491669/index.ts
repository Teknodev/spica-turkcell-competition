import * as Bucket from "@spica-devkit/bucket";
import { database, close, ObjectId } from "@spica-devkit/database";
const fetch = require("node-fetch");

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const DUEL_ANSWERS_BUCKET_ID = process.env.DUEL_ANSWERS_BUCKET_ID;
const AFKCHECKER_API_KEY = process.env.AFKCHECKER_API_KEY;
const DUEL_ANSWER_ID = process.env.DUEL_ANSWER_ID;
const DUEL_BUCKET_ID = process.env.DUEL_BUCKET_ID;

let db;

export async function checkAFK(change) {
    // Bucket.initialize({ apikey: SECRET_API_KEY });
    // const DUEL_BUCKET_ID = change.bucket;
    // const duelId = change.documentKey;
    // const currentQuestionId = change.current.current_question;
    // const previousQuestionId = change.previous.current_question;
    // const duelInfo = change.current;
    // console.log("2", change);
    // console.log("currentQuestionId, previousQuestionId", currentQuestionId, previousQuestionId);
    // If the change is question
    // if (currentQuestionId != previousQuestionId) {

    /*
        Change$1 {
            kind: 'replace',
            collection: 'bucket_605ca275e9960e002c2781a4',
            documentKey: '6082e173bd7a7b9b06e23eac',
            document: {
                _id: '6082e173bd7a7b9b06e23eac',
                user1: '6081de7d0ca9c4002ceb7496',
                user2: '60784f733dff6c002cd39c71',
                user1_ready: true,
                user2_ready: true,
                created_at: '2021-04-23T15:02:11.108Z',
                current_question: '6076f998a04c51002d2568ff',
                options: [ 'Su', 'Kireç taşı', 'Tuz ruhu', 'Deterjan' ],
                last_question_date: '2021-04-23T15:03:09.390Z',
                user1_answer: 'Kireç taşı',
                user2_answer: 'Tuz ruhu',
                current_answer: 'Tuz ruhu',
                winner_of_current_question: 2
            }
        }

        Change$1 {
                kind: 'replace',
                collection: 'bucket_605ca275e9960e002c2781a4',
                documentKey: '6082e173bd7a7b9b06e23eac',
                document: {
                    _id: '6082e173bd7a7b9b06e23eac',
                    user1: '6081de7d0ca9c4002ceb7496',
                    user2: '60784f733dff6c002cd39c71',
                    user1_ready: true,
                    user2_ready: true,
                    created_at: '2021-04-23T15:02:11.108Z',
                    current_question: '6076f998a04c51002d2568ff',
                    options: [ 'Su', 'Kireç taşı', 'Tuz ruhu', 'Deterjan' ],
                    last_question_date: '2021-04-23T15:03:09.390Z'
                }
            }
         */

    // Bucket.initialize({ apikey: SECRET_API_KEY });
    if (!db) db = await database().catch(err => console.log("ERROR 4", err));

    const duelId = change.documentKey;
    const currentQuestionId = change.document.current_question;
    const duelInfo = change.document;

    const duels_collection = db.collection(`bucket_${DUEL_BUCKET_ID}`);
    const duel_answers_collection = db.collection(`bucket_${DUEL_ANSWER_ID}`);

    // if new question replaced added (not answers replaced)
    if (
        duelInfo.winner_of_current_question == undefined ||
        duelInfo.user1_answer == undefined ||
        duelInfo.user2_answer == undefined
    ) {
        let timeOut = setTimeout(async _ => {
            // const latestDuelInfo = await Bucket.data
            //     .get(DUEL_BUCKET_ID, duelId)
            //     .catch(err => console.log("ERROR 1", err));

            const latestDuelInfo = await duels_collection
                .findOne({ _id: ObjectId(duelId) })
                .catch(err => console.log("ERROR 2", err));

            //Check if the current question is the same with the question 15 seconds ago
            if (latestDuelInfo.current_question == currentQuestionId) {
                // Check if any of them didn't answer yet

                // const duelAnswer = await Bucket.data
                //     .getAll(DUEL_ANSWER_ID, {
                //         queryParams: {
                //             filter: {
                //                 duel: latestDuelInfo._id,
                //                 question: currentQuestionId
                //             }
                //         }
                //     })
                //     .catch(err => console.log("ERROR 2", err));

                const duelAnswer = await duel_answers_collection
                    .find({
                        duel: String(latestDuelInfo._id),
                        question: String(currentQuestionId)
                    })
                    .toArray()
                    .catch(err => console.log("ERROR 3", err));

                let user1_is_afk = false;
                let user2_is_afk = false;

                if (duelAnswer.length > 0) {
                    user1_is_afk = duelAnswer[0].user1_answer == undefined ? true : false;
                    user2_is_afk = duelAnswer[0].user2_answer == undefined ? true : false;
                }

                if (duelAnswer.length == 0 || user1_is_afk) {
                    duelInfo.user1_answer = "";
                    await fetch(
                        "https://turkcell-competition-fea47.hq.spicaengine.com/api/fn-execute/answerQuestion",
                        {
                            method: "post",
                            body: JSON.stringify({
                                duel_id: duelInfo._id,
                                answer: "",
                                user_id: duelInfo.user1
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                authorization: `APIKEY ${AFKCHECKER_API_KEY}`
                            }
                        }
                    )
                        .then(res => {
                            let response;
                            try {
                                response = res.json();
                            } catch (err) {
                                console.log(res);
                                response = null;
                            }
                            return response;
                        })
                        .catch(err => console.log("ERROR 3", err));
                }

                if (duelAnswer.length == 0 || user2_is_afk) {
                    duelInfo.user2_answer = "";
                    await fetch(
                        "https://turkcell-competition-fea47.hq.spicaengine.com/api/fn-execute/answerQuestion",
                        {
                            method: "post",
                            body: JSON.stringify({
                                duel_id: duelInfo._id,
                                answer: "",
                                user_id: duelInfo.user2
                            }),
                            headers: {
                                "Content-Type": "application/json",
                                authorization: `APIKEY ${AFKCHECKER_API_KEY}`
                            }
                        }
                    )
                        .then(res => {
                            let response;
                            try {
                                response = res.json();
                            } catch (err) {
                                console.log(res);
                                response = null;
                            }
                            return response;
                        })
                        .catch(err => console.log("ERROR 4", err));
                }
            } else {
                //console.log("NOT SAME QUESTIONS", latestDuelInfo.current_question, currentQuestionId);
            }
        }, 20000);
    } else {
        //console.log("Duel answers updated, not question");
    }
}
