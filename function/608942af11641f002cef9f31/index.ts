import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
const json2csv = require("json2csv").parse;
const admz = require("adm-zip");

const SECRET_API_KEY = process.env.SECRET_API_KEY;
const PAST_MATCHES_BUCKET_ID = process.env.PAST_MATCHES_BUCKET_ID;
const REWARD_LOGS_BUCKET_ID = process.env.REWARD_LOGS_BUCKET_ID;
const CHARGE_LOGS_BUCKET_ID = process.env.CHARGE_LOGS_BUCKET_ID;
const MAILER_BUCKET_ID = process.env.MAILER_BUCKET_ID;
const QUESTION_BUCKET_ID = process.env.QUESTION_BUCKET_ID;
const QUESTION_REPORT_BUCKET_ID = process.env.QUESTION_REPORT_BUCKET_ID;
const MATCH_REPORT_BUCKET_ID = process.env.MATCH_REPORT_BUCKET_ID;
const USER_BUCKET_ID = process.env.USER_BUCKET_ID;
const USER_REPORT_BUCKET_ID = process.env.USER_REPORT_BUCKET_ID;
const CHARGE_REPORT_BUCKET_ID = process.env.CHARGE_REPORT_BUCKET_ID;
const USERS_MATCH_REPORT_BUCKET_ID = process.env.USERS_MATCH_REPORT_BUCKET_ID;
const WIN_LOSE_MATCHES_BUCKET_ID = process.env.WIN_LOSE_MATCHES_BUCKET_ID;
const ANSWERS_TO_QUESTION_REPORT_BUCKET_ID = process.env.ANSWERS_TO_QUESTION_REPORT_BUCKET_ID;
const SINGLEPLAY_PAST_MATCHES = process.env.SINGLEPLAY_PAST_MATCHES;


const PLAY_COUNT_LOGS_BUCKET_ID = process.env.PLAY_COUNT_LOGS_BUCKET_ID;
const MANUALLY_REWARD_BUCKET_ID = process.env.MANUALLY_REWARD_BUCKET_ID;
const RETRY_REPORT_BUCKET_ID = process.env.RETRY_REPORT_BUCKET_ID;
const REWARD_REPORT_BUCKET_ID = process.env.REWARD_REPORT_BUCKET_ID;
const BUGGED_REWARD_BUCKET_ID = process.env.BUGGED_REWARD_BUCKET_ID;

const DAILY_1GB_OFFER_ID = 481642; //451318 changed
const HOURLY_1GB_OFFER_ID = 451319;
// const DAILY_2GB_OFFER_ID = 455884;
const CHARGE_AMOUNT = "35 TL";

export async function executeReportDaily() {
    let date = new Date().setDate(new Date().getDate() - 1)
    let dateFrom = new Date(date).setHours(0, 0, 0);
    let dateTo = new Date(date).setHours(23, 59, 59);

    await Promise.all([
        // questionReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 1", err)),
        userReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 2", err)),
        playedMatchCount(0, dateFrom, dateTo).catch(err => console.log("ERROR: 3", err)),
        matchReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 4", err)),
        matchWinLoseCount(0, dateFrom, dateTo).catch(err => console.log("ERROR: 5", err)),
        chargeReportExport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 6", err)),
        retryReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 7", err)),
        getFailedRewards(0, dateFrom, dateTo).catch(err => console.log("ERROR: 8", err)),
    ])

    await reportExportSend("Günlük Rapor", 0).catch(err => console.log("ERROR: 10", err));

    return true;
}
export async function executeReportWeekly() {
    await reportExportSend("Haftalık Toplam Rapor", 1).catch(err => console.log("ERROR: 63", err));
    await reportExportSend("Haftalık Gün Bazlı Rapor", 11).catch(err =>
        console.log("ERROR: 63", err)
    );

    return true;
}
export async function executeReportMonthly() {
    await reportExportSend("Aylık Gün Bazlı Rapor", 22).catch(err =>
        console.log("ERROR: 163", err)
    );
    await reportExportSend("Aylık Toplam Rapor", 2).catch(err =>
        console.log("ERROR: 163", err)
    );

    return true;
}

export async function questionReport(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR: 16", err));

    const pastMatchesCollection = db.collection(`bucket_${PAST_MATCHES_BUCKET_ID}`);
    const questionCollection = db.collection(`bucket_${QUESTION_BUCKET_ID}`);
    const questionReportCollection = db.collection(`bucket_${QUESTION_REPORT_BUCKET_ID}`);
    const answersToQuestionsCollection = db.collection(
        `bucket_${ANSWERS_TO_QUESTION_REPORT_BUCKET_ID}`
    );

    await questionReportCollection.deleteMany().catch(err => console.log("ERROR: 17", err));
    const questions = await questionCollection.find().toArray();

    let questionsArr = [];
    let questionsRep = [];

    const pastDuels = await pastMatchesCollection
        .find({ end_time: { $gte: dateFrom, $lt: dateTo } })
        .toArray()
        .catch(err => console.log("ERROR: 18", err));
    if (pastDuels[0]) {
        pastDuels.forEach(duel => {
            if (duel.questions) {
                duel.questions.forEach(questionItem => {
                    let question = JSON.parse(questionItem);
                    let correct = 0;
                    let wrong = 0;
                    if (question.user1_answer === question.correct_answer) correct = correct + 1;
                    else wrong = wrong + 1;
                    if (question.user2_answer === question.correct_answer) correct = correct + 1;
                    else wrong = wrong + 1;

                    questionsArr.push({
                        _id: question.question,
                        correct: correct,
                        wrong: wrong
                    });
                });
            }
        });

        questionsArr.forEach(a => {
            if (!questionsRep.some(n => n._id == a._id)) {
                questionsRep.push(a);
            } else {
                questionsRep.forEach(n => {
                    if (n._id == a._id) {
                        n.correct = n.correct + a.correct;
                        n.wrong = n.wrong + a.wrong;
                        return;
                    }
                });
            }
        });

        let insertPromises = [];
        questions.forEach(question => {
            let item = questionsRep.find(e => {
                return e._id == question._id;
            });
            insertPromises.push(
                questionReportCollection.insert({
                    question_id: String(question._id),
                    question: question.question,
                    level: question.level,
                    correct_answer: item ? item.correct : 0,
                    wrong_answer: item ? item.wrong : 0
                })
            );
        });

        await Promise.all(insertPromises).catch(err => console.log("ERROR: 19", err));

        let questionsData = await questionReportCollection
            .find()
            .toArray()
            .catch(e => {
                console.log("ERROR 39", e);
            });

        let resultLevel = [];
        for (let level of [1, 2, 3]) {
            const resLevel = questionsData.filter(val => {
                return val.level == level;
            });

            const correct = resLevel.reduce((acc, val) => acc + val.correct_answer, 0);
            const wrong = resLevel.reduce((acc, val) => acc + val.wrong_answer, 0);

            resultLevel.push({ level: level, correct: correct, wrong: wrong });
        }

        await answersToQuestionsCollection
            .insertOne({
                date: new Date(reportDate),
                correct_answer_1: resultLevel[0].correct,
                correct_answer_2: resultLevel[1].correct,
                correct_answer_3: resultLevel[2].correct,
                wrong_answer_1: resultLevel[0].wrong,
                wrong_answer_2: resultLevel[1].wrong,
                wrong_answer_3: resultLevel[2].wrong,
                report_type: reportType
            })
            .catch(e => {
                console.log("ERROR 56", e);
            });
    }

    return true;
}

export async function matchReport(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR: 21", err));
    const pastMatchesCollection = db.collection(`bucket_${PAST_MATCHES_BUCKET_ID}`);
    const matchReportCollection = db.collection(`bucket_${MATCH_REPORT_BUCKET_ID}`);
    const rewardLogsCollection = db.collection(`bucket_${REWARD_LOGS_BUCKET_ID}`);
    const buggedRewardsCollection = db.collection(`bucket_${BUGGED_REWARD_BUCKET_ID}`);

    let p2pMatchCount = 0,
        p2pMatchPointsEarned = 0,
        p2mMatchCount = 0,
        p2mMatchPointsEarned = 0,
        daily_reward_earned = 0;

    const p2pMatches = await pastMatchesCollection
        .find({
            player_type: 0,
            end_time: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .toArray()
        .catch(err => console.log("ERROR: 23", err));

    const p2mMatches = await pastMatchesCollection
        .find({
            player_type: 1,
            end_time: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .toArray()
        .catch(err => console.log("ERROR: 24", err));


    p2pMatches.forEach(match => {
        if (match.winner == 1 || match.winner == 2) {
            daily_reward_earned += 3
        }
        p2pMatchPointsEarned += match.points_earned;
    });

    p2mMatches.forEach(match => {
        if (match.winner == 1) {
            daily_reward_earned += 2
        }
        p2mMatchPointsEarned += match.points_earned;
    });

    p2pMatchCount = p2pMatches.length;
    p2mMatchCount = p2mMatches.length;

    const rewardDailyTrue = await rewardLogsCollection
        .countDocuments({
            offer_id: DAILY_1GB_OFFER_ID,
            status: true,
            date: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR: 53", err));

    const rewardDailyFalse = await buggedRewardsCollection
        .countDocuments({
            offer_id: DAILY_1GB_OFFER_ID,
            status: false,
            date: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR: 54", err));

    const rewardFreeTrue = await rewardLogsCollection
        .countDocuments({
            offer_id: HOURLY_1GB_OFFER_ID,
            status: true,
            date: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR: 53", err));

    const rewardFreeFalse = await buggedRewardsCollection
        .countDocuments({
            offer_id: HOURLY_1GB_OFFER_ID,
            status: false,
            date: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR: 54", err));

    const rewardDailyMatchTrue = await rewardLogsCollection
        .countDocuments({
            offer_id: DAILY_1GB_OFFER_ID,
            status: true,
            type: 'match',
            date: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR", err));

    const rewardDailyChargeTrue = await rewardLogsCollection
        .countDocuments({
            offer_id: DAILY_1GB_OFFER_ID,
            status: true,
            type: 'charge',
            date: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR", err));

    await matchReportCollection
        .insertOne({
            date: new Date(reportDate),
            p2p_play: p2pMatchCount,
            p2p_play_points_earned: p2pMatchPointsEarned,
            p2m_play: p2mMatchCount,
            p2m_play_points_earned: p2mMatchPointsEarned,
            daily_match_reward: rewardDailyMatchTrue,
            daily_charge_reward: rewardDailyChargeTrue,
            daily_reward_true: rewardDailyTrue,
            daily_reward_false: rewardDailyFalse,
            daily_reward_earned: daily_reward_earned,
            report_type: reportType,
            free_reward_true: rewardFreeTrue,
            free_reward_false: rewardFreeFalse
        })
        .catch(err => console.log("ERROR: 27", err));

    return true;
}

export async function chargeReportExport(reportType, dateFrom, dateTo) {
    const db = await database().catch(err => console.log("ERROR 40: ", err));
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const chargesCollection = db.collection(`bucket_${CHARGE_LOGS_BUCKET_ID}`);
    const chargeReportCollection = db.collection(`bucket_${CHARGE_REPORT_BUCKET_ID}`);
    const playCountCollection = db.collection(`bucket_${PLAY_COUNT_LOGS_BUCKET_ID}`);

    let missingPlayCount = 0;
    const playCounts = await playCountCollection.find({
        created_at: { $gte: dateFrom, $lt: dateTo }
    }).toArray().catch(err => console.log("ERROR", err))

    playCounts.forEach(el => {
        el.added_play_count.forEach(playCounts => {
            missingPlayCount += playCounts.missing_play_count
        })
    })

    const [chargesSuccessful, error1, error2, error3, error4, error5, error6, error7] = await Promise.all([
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: true })
            .catch(err => console.log("ERROR 41: ", err)),
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Devam eden diğer işlemlerden dolayı Oyun aboneliği gerçekleştirilememektedir." })
            .catch(err => console.log("ERROR 42: ", err)),
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Abone kredisi(bakiyesi) yetersiz." })
            .catch(err => console.log("ERROR 43: ", err)),
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Abone bulunamadi." })
            .catch(err => console.log("ERROR 44: ", err)),
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Abone kara listede islem yapilamaz." })
            .catch(err => console.log("ERROR 45: ", err)),
        chargesCollection.countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Hattiniz Katma Degerli Servis aboneligine kapali oldugu icin Oyun servisine abonelik talebiniz gerceklestirilememistir. Abonelik izninizi 532?yi arayarak actirabilirsiniz." })
            .catch(err => console.log("ERROR 46: ", err)),
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Rahat Hatlar bu servisten yararlanamazlar." })
            .catch(err => console.log("ERROR 47: ", err)),
        chargesCollection
            .countDocuments({ date: { $gte: dateFrom, $lt: dateTo }, status: false, user_text: "Sistemlerde oluşan hata sebebi ile işleminiz yapılamıyor. İşleminiz tekrar denenmek üzere kuyruğa atılmıştır." })
            .catch(err => console.log("ERROR 48: ", err))

    ])

    // const chargesSuccessful = await chargesCollection
    //     .find({ date: { $gte: dateFrom, $lt: dateTo }, status: true })
    //     .toArray()
    //     .catch(err => console.log("ERROR 41: ", err));

    // const error1 = await chargesCollection
    //     .find({
    //         date: { $gte: dateFrom, $lt: dateTo },
    //         status: false,
    //         user_text:
    //             "Devam eden diğer işlemlerden dolayı Oyun aboneliği gerçekleştirilememektedir."
    //     })
    //     .toArray()
    //     .catch(err => console.log("ERROR 42: ", err));

    // const error2 = await chargesCollection
    //     .find({
    //         date: { $gte: dateFrom, $lt: dateTo },
    //         status: false,
    //         user_text: "Abone kredisi(bakiyesi) yetersiz."
    //     })
    //     .toArray()
    //     .catch(err => console.log("ERROR 43: ", err));

    // const error3 = await chargesCollection
    //     .find({
    //         date: { $gte: dateFrom, $lt: dateTo },
    //         status: false,
    //         user_text: "Abone bulunamadi."
    //     })
    //     .toArray()
    //     .catch(err => console.log("ERROR 44: ", err));

    // const error4 = await chargesCollection
    //     .find({
    //         date: { $gte: dateFrom, $lt: dateTo },
    //         status: false,
    //         user_text: "Abone kara listede islem yapilamaz."
    //     })
    //     .toArray()
    //     .catch(err => console.log("ERROR 45: ", err));

    // const error5 = await chargesCollection
    //     .find({
    //         date: { $gte: dateFrom, $lt: dateTo },
    //         status: false,
    //         user_text:
    //             "Hattiniz Katma Degerli Servis aboneligine kapali oldugu icin Oyun servisine abonelik talebiniz gerceklestirilememistir. Abonelik izninizi 532?yi arayarak actirabilirsiniz."
    //     })
    //     .toArray()
    //     .catch(err => console.log("ERROR 46: ", err));
    // const error6 = await chargesCollection
    //     .find({
    //         date: { $gte: dateFrom, $lt: dateTo },
    //         status: false,
    //         user_text: "Rahat Hatlar bu servisten yararlanamazlar."
    //     })

    //     .toArray()
    //     .catch(err => console.log("ERROR 47: ", err));

    // const error7 = await chargesCollection
    // .find({
    //     date: { $gte: dateFrom, $lt: dateTo },
    //     status: false,
    //     user_text:
    //         "Sistemlerde oluşan hata sebebi ile işleminiz yapılamıyor. İşleminiz tekrar denenmek üzere kuyruğa atılmıştır."
    // })

    // .toArray()
    // .catch(err => console.log("ERROR 48: ", err));

    let totalQuantity = chargesSuccessful + error1 + error2 + error3 + error4 + error5 + error6 + error7;

    const datas = [
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: chargesSuccessful,
            ratio: chargesSuccessful ? Number(((chargesSuccessful / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarılı",
            play_count: chargesSuccessful - missingPlayCount,
            error: "-",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error1,
            ratio: error1 ? Number(((error1 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error:
                "Devam eden diğer işlemlerden dolayı Oyun aboneliği gerçekleştirilememektedir.",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error2,
            ratio: error2 ? Number(((error2 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error: "Abone kredisi(bakiyesi) yetersiz.",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error3,
            ratio: error3 ? Number(((error3 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error: "Abone bulunamadi.",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error4,
            ratio: error4 ? Number(((error4 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error: "Abone kara listede islem yapilamaz.",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error5,
            ratio: error5 ? Number(((error5 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error:
                "Hattiniz Katma Degerli Servis aboneligine kapali oldugu icin Oyun servisine abonelik talebiniz gerceklestirilememistir. Abonelik izninizi 532?yi arayarak actirabilirsiniz.",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error6,
            ratio: error6 ? Number(((error6 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error: "Rahat Hatlar bu servisten yararlanamazlar.",
            report_type: reportType
        },
        {
            date: new Date(reportDate),
            charge_amount: CHARGE_AMOUNT,
            quantity: error7,
            ratio: error7 ? Number(((error7 / totalQuantity) * 100).toFixed(2)) : 0,
            status: "Başarısız",
            play_count: "-",
            error:
                "Sistemlerde oluşan hata sebebi ile işleminiz yapılamıyor. İşleminiz tekrar denenmek üzere kuyruğa atılmıştır.",
            report_type: reportType
        }
    ];

    await chargeReportCollection.insertMany(datas).catch(err => console.log("ERROR 49: ", err));

    return true;
}

export async function userReport(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR: 30", err));
    const usersCollection = db.collection(`bucket_${USER_BUCKET_ID}`);
    const userReportCollection = db.collection(`bucket_${USER_REPORT_BUCKET_ID}`);

    const usersCount = await usersCollection.count();
    const newUsersCount = await usersCollection
        .countDocuments({
            created_at: {
                $gte: dateFrom,
                $lt: dateTo
            }
        })
        .catch(err => console.log("ERROR: 32", err));

    await userReportCollection
        .insertOne({
            date: new Date(reportDate),
            total_user: usersCount,
            new_user: newUsersCount,
            created_at: new Date(),
            report_type: reportType
        })
        .catch(err => console.log("ERROR: 33", err));

    return true;
}

async function playedMatchCount(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR 38", err));
    const pastMatchesCollection = db.collection(`bucket_${SINGLEPLAY_PAST_MATCHES}`);
    const userMatchCollection = db.collection(`bucket_${USERS_MATCH_REPORT_BUCKET_ID}`);

    const [
        paidMatches,
        freeMatches,
        paidUserCount,
        freeUserCount
    ] = await Promise.all([
        pastMatchesCollection.countDocuments({
            end_time: { $gte: dateFrom, $lt: dateTo },
            user_is_free: false
        }),
        pastMatchesCollection.countDocuments({
            end_time: { $gte: dateFrom, $lt: dateTo },
            user_is_free: true
        }),
        pastMatchesCollection
            .distinct("user", {
                end_time: { $gte: dateFrom, $lt: dateTo },
                user_is_free: false
            })
            .then(users => users.length)
            .catch(err => {
                console.log("ERROR 39 - Paid Users", err);
                return 0;
            }),
        pastMatchesCollection
            .distinct("user", {
                end_time: { $gte: dateFrom, $lt: dateTo },
                user_is_free: true
            })
            .then(users => users.length)
            .catch(err => {
                console.log("ERROR 39 - Free Users", err);
                return 0;
            })
    ]);
    // let paidUsers = await pastMatchesCollection
    //     .aggregate([
    //         { $match: { end_time: { $gte: dateFrom, $lt: dateTo }, user_is_free: false } },
    //         { $group: { _id: "$user" } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 39", err));

    // let freeUsers = await pastMatchesCollection
    //     .aggregate([
    //         { $match: { end_time: { $gte: dateFrom, $lt: dateTo }, user_is_free: true } },
    //         { $group: { _id: "$user" } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 39", err));


    // let user1Paid = await pastMatchesCollection
    //     .aggregate([
    //         { $match: { end_time: { $gte: dateFrom, $lt: dateTo }, user1_is_free: false } },
    //         { $group: { _id: "$user1" } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 39", err));

    // let user2Paid = await pastMatchesCollection
    //     .aggregate([
    //         {
    //             $match: {
    //                 end_time: { $gte: dateFrom, $lt: dateTo },
    //                 player_type: 0,
    //                 user2_is_free: false
    //             }
    //         },
    //         { $group: { _id: "$user2" } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 40", err));

    // let user1Free = await pastMatchesCollection
    //     .aggregate([
    //         { $match: { end_time: { $gte: dateFrom, $lt: dateTo }, user1_is_free: true } },
    //         { $group: { _id: "$user1" } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 41", err));

    // let user2Free = await pastMatchesCollection
    //     .aggregate([
    //         {
    //             $match: {
    //                 end_time: { $gte: dateFrom, $lt: dateTo },
    //                 player_type: 0,
    //                 user2_is_free: true
    //             }
    //         },
    //         { $group: { _id: "$user1" } }
    //     ])
    //     .toArray()
    //     .catch(err => console.log("ERROR 42", err));

    // const paidvsPaidP2P = await pastMatchesCollection
    //     .find({
    //         player_type: 0,
    //         user1_is_free: false,
    //         user2_is_free: false,
    //         end_time: { $gte: dateFrom, $lt: dateTo }
    //     })
    //     .count()
    //     .catch(err => console.log("ERROR 43", err));

    // const freevsPaidP2P = await pastMatchesCollection
    //     .find({
    //         player_type: 0,
    //         $or: [
    //             { user1_is_free: false, user2_is_free: true },
    //             { user1_is_free: true, user2_is_free: false }
    //         ],
    //         end_time: { $gte: dateFrom, $lt: dateTo }
    //     })
    //     .count()
    //     .catch(err => console.log("ERROR 44", err));

    // const paidvsBot = await pastMatchesCollection
    //     .find({
    //         player_type: 1,
    //         user1_is_free: false,
    //         end_time: { $gte: dateFrom, $lt: dateTo }
    //     })
    //     .count()
    //     .catch(err => console.log("ERROR 45", err));

    // const freevsFreeP2P = await pastMatchesCollection
    //     .find({
    //         player_type: 0,
    //         user1_is_free: true,
    //         user2_is_free: true,
    //         end_time: { $gte: dateFrom, $lt: dateTo }
    //     })
    //     .count()
    //     .catch(err => console.log("ERROR 46", err));

    // const freevsBot = await pastMatchesCollection
    //     .find({
    //         player_type: 1,
    //         user1_is_free: true,
    //         end_time: { $gte: dateFrom, $lt: dateTo }
    //     })
    //     .count()
    //     .catch(err => console.log("ERROR 47", err));

    // user1Paid = user1Paid.map(el => el._id);
    // user2Paid = user2Paid.map(el => el._id);
    // user1Free = user1Free.map(el => el._id);
    // user2Free = user2Free.map(el => el._id);
    // let paid = [...new Set([...user1Paid, ...user2Paid])];
    // let free = [...new Set([...user1Free, ...user2Free])];
    // paid = paid.length;
    // free = free.length;

    await userMatchCollection
        .insertOne({
            date: new Date(reportDate),
            paid_player: paidUserCount,
            free_player: freeUserCount,
            paid_play_total: paidMatches,
            free_play_total: freeMatches,
            report_type: reportType
        })
        .catch(err => console.log("ERROR 48", err));

    return true;
}

async function matchWinLoseCount(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR 50", err));
    const pastMatchesCollection = db.collection(`bucket_${SINGLEPLAY_PAST_MATCHES}`);
    const winLoseCollection = db.collection(`bucket_${WIN_LOSE_MATCHES_BUCKET_ID}`);

    const freeWin = await pastMatchesCollection
        .countDocuments({
            end_time: { $gte: dateFrom, $lt: dateTo },
            user_is_free: true,
            is_win: true
        })

    const freeLose = await pastMatchesCollection
        .countDocuments({
            end_time: { $gte: dateFrom, $lt: dateTo },
            user_is_free: true,
            is_win: false
        })

    const paidWin = await pastMatchesCollection
        .countDocuments({
            end_time: { $gte: dateFrom, $lt: dateTo },
            user_is_free: false,
            is_win: true
        })

    const paidLose = await pastMatchesCollection
        .countDocuments({
            end_time: { $gte: dateFrom, $lt: dateTo },
            user_is_free: false,
            is_win: false
        })

    // let freeWin = await pastMatchesCollection
    //     .find({
    //         end_time: { $gte: dateFrom, $lt: dateTo },
    //         $or: [
    //             { user1_is_free: true, winner: 1 },
    //             { user2_is_free: true, winner: 2, player_type: 0 }
    //         ]
    //     })
    //     .count();

    // let freeLose = await pastMatchesCollection
    //     .find({
    //         end_time: { $gte: dateFrom, $lt: dateTo },
    //         $or: [
    //             { user1_is_free: true, winner: 2 },
    //             { user2_is_free: true, winner: 1, player_type: 0 }
    //         ]
    //     })
    //     .count();

    // let paidWin = await pastMatchesCollection
    //     .find({
    //         end_time: { $gte: dateFrom, $lt: dateTo },
    //         $or: [
    //             { user1_is_free: false, winner: 1 },
    //             { user2_is_free: false, winner: 2, player_type: 0 }
    //         ]
    //     })
    //     .count();

    // let paidLose = await pastMatchesCollection
    //     .find({
    //         end_time: { $gte: dateFrom, $lt: dateTo },
    //         $or: [
    //             { user1_is_free: false, winner: 2 },
    //             { user2_is_free: false, winner: 1, player_type: 0 }
    //         ]
    //     })
    //     .count();

    await winLoseCollection
        .insertOne({
            date: new Date(reportDate),
            win_paid: paidWin,
            win_free: freeWin,
            lose_paid: paidLose,
            lose_free: freeLose,
            win_total: paidWin + freeWin,
            lose_total: paidLose + freeLose,
            report_type: reportType
        })
        .catch(err => console.log("ERROR 51", err));

    return true;
}

export async function reportExportSend(title, reportType) {
    Bucket.initialize({ apikey: SECRET_API_KEY });
    await Bucket.data
        .insert(MAILER_BUCKET_ID, {
            title: title,
            template: "report-mail",
            variables: `{"title": "${title}"}`,
            emails: [
                "emre.akatin@turkcell.com.tr",
                "serdar@polyhagency.com",
                "caglar@polyhagency.com",
                "asli.bayram@turkcell.com.tr",
                "tarik.dervis@turkcell.com.tr",
                "murat.malci@turkcell.com.tr",
                "ozkan.hakan@turkcell.com.tr",
                "Pinar.koca@turkcell.com.tr",
                "ozangol@teknodev.biz",
                "serkan@polyhagency.com",
                "batuhanevirgen@teknodev.biz"
            ],
            report_type: reportType
        })
        .catch(err => console.log("ERROR: 35", err));
    return true;
}

export async function retryReport(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR: 30", err));
    const manualRewardCollection = db.collection(`bucket_${MANUALLY_REWARD_BUCKET_ID}`);
    const retryReportCollection = db.collection(`bucket_${RETRY_REPORT_BUCKET_ID}`);

    let hourly_retry_false = 0,
        hourly_retry_true = 0,
        daily_retry_false = 0,
        daily_retry_true = 0;

    const manualRewards = await manualRewardCollection.find({
        created_at: {
            $gte: dateFrom,
            $lt: dateTo
        },
        system: true
    }).toArray().catch(err => console.log("ERROR ", err))


    manualRewards.forEach(reward => {
        if (reward.reward == 'hourly_1') {
            if (reward.process_completed)
                hourly_retry_true += 1
            else hourly_retry_false += 1
        } else {
            if (reward.process_completed)
                daily_retry_true += 1
            else daily_retry_false += 1
        }
    })

    await retryReportCollection
        .insertOne({
            hourly_retry_false: hourly_retry_false,
            hourly_retry_true: hourly_retry_true,
            daily_retry_false: daily_retry_false,
            daily_retry_true: daily_retry_true,
            date: new Date(reportDate),
            report_type: reportType
        })
        .catch(err => console.log("ERROR: 33", err));

    return true;
}

export async function getFailedRewards(reportType, dateFrom, dateTo) {
    dateFrom = new Date(dateFrom);
    dateTo = new Date(dateTo);
    let reportDate = new Date().setDate(new Date().getDate() - 1)

    const db = await database().catch(err => console.log("ERROR ", err));
    const rewardLogsCollection = db.collection(`bucket_${BUGGED_REWARD_BUCKET_ID}`);
    const rewardReportCollection = db.collection(`bucket_${REWARD_REPORT_BUCKET_ID}`);

    let rewardHourlyFalse = await rewardLogsCollection
        .aggregate([
            {
                $match: {
                    status: false,
                    date: {
                        $gte: dateFrom,
                        $lt: dateTo
                    }
                }
            },
            { $group: { _id: "$user_text", count: { $sum: 1 } } }
        ])
        .toArray();

    let totalReward = 0;
    for (let reward of rewardHourlyFalse) {
        totalReward += reward.count;
    }

    for (let reward of rewardHourlyFalse) {
        let data = {
            date: new Date(reportDate),
            count: reward.count,
            ratio: reward.count ? Number(((reward.count / totalReward) * 100).toFixed(2)) : 0,
            error_text: reward._id,
            report_type: reportType
        }
        await rewardReportCollection.insertOne(data).catch(err => console.log("ERROR ", err))
    }

    return true
}

export async function executeReportMonthlyMan() {
    console.log("@mounthly-report")
    await reportExportSend("Aylık Gün Bazlı Rapor Güncel", 22).catch(err =>
        console.log("ERROR: 163", err)
    );
    await reportExportSend("Aylık Toplam Rapor Güncel", 2).catch(err =>
        console.log("ERROR: 163", err)
    );

    return true;
}


export async function matchChargeCountList(req, res) {
    const db = await database().catch(err => console.log("ERROR ", err));

    let begin = new Date("12/22/2021, 00:00:01")
    let end = new Date("1/18/2022, 23:59:59")
    const chargeCollection = db.collection(`bucket_${CHARGE_LOGS_BUCKET_ID}`);

    const datas = await chargeCollection
        .aggregate([
            {
                $match: {
                    status: true,
                    date: {
                        $gte: begin,
                        $lt: end
                    }
                }
            },
            { $group: { _id: "$msisdn", count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]).toArray()
        .catch(err => console.log("ERROR ", err));

    let formattedString = json2csv(datas, { fields: ['_id', 'count'] });
    res.headers.set(
        "Content-Disposition",
        "attachment; filename=math.xlsx"
    );
    res.headers.set("Content-Type", "application/octet-stream");
    return res.status(200).send(formattedString);
}

export async function executeReportDailyMan(req, res) {
    let date = new Date().setDate(new Date().getDate() - 1)
    let dateFrom = new Date(date).setHours(0, 0, 0);
    let dateTo = new Date(date).setHours(23, 59, 59);

    await Promise.all([
        userReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 4", err)),
        playedMatchCount(0, dateFrom, dateTo).catch(err => console.log("ERROR: 49", err)),
        matchReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 2", err)),
        matchWinLoseCount(0, dateFrom, dateTo).catch(err => console.log("ERROR: 55", err)),
        chargeReportExport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 3", err)),
        retryReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: ", err)),
        getFailedRewards(0, dateFrom, dateTo).catch(err => console.log("ERROR: ", err))
    ])
    // await userReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 4", err));
    // await playedMatchCount(0, dateFrom, dateTo).catch(err => console.log("ERROR: 49", err));
    // await matchReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 2", err));
    // await matchWinLoseCount(0, dateFrom, dateTo).catch(err => console.log("ERROR: 55", err));
    // await chargeReportExport(0, dateFrom, dateTo).catch(err => console.log("ERROR: 3", err));
    // await retryReport(0, dateFrom, dateTo).catch(err => console.log("ERROR: ", err));
    // await getFailedRewards(0, dateFrom, dateTo).catch(err => console.log("ERROR: ", err));

    await reportExportSend("Günlük Rapor", 0).catch(err => console.log("ERROR: 5", err));

    return res.status(200).send({ message: 'ok' })

}

export async function executeReportWeeklyMan(req, res) {
    // let date1 = new Date();
    // let date2 = new Date();
    // let dateFrom = date1.setHours(date1.getHours() - 178);
    // let dateTo = date2.setHours(date2.getHours() - 10);

    // await questionReport(1, dateFrom, dateTo).catch(err => console.log("ERROR: 57", err));
    // await userReport(1, dateFrom, dateTo).catch(err => console.log("ERROR: 58", err));
    // await playedMatchCount(1, dateFrom, dateTo).catch(err => console.log("ERROR: 59", err));
    // await matchReport(1, dateFrom, dateTo).catch(err => console.log("ERROR: 60", err));
    // await matchWinLoseCount(1, dateFrom, dateTo).catch(err => console.log("ERROR: 61", err));
    // await chargeReportExport(1, dateFrom, dateTo).catch(err => console.log("ERROR: 62", err));
    // await retryReport(1, dateFrom, dateTo).catch(err => console.log("ERROR: ", err));
    // await getFailedRewards(1, dateFrom, dateTo).catch(err => console.log("ERROR: ", err));

    await reportExportSend("Haftalık Toplam Rapor", 1).catch(err => console.log("ERROR: 63", err));
    await reportExportSend("Haftalık Gün Bazlı Rapor", 11).catch(err =>
        console.log("ERROR: 63", err)
    );

    return res.status(200).send({ message: 'ok' });
}