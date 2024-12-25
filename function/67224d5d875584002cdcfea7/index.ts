import { database } from "@spica-devkit/database";
const QUESTION_BUCKET_ID = process.env.QUESTION_BUCKET_ID;
const OPTIONS_BUCKET_ID = process.env.OPTIONS_BUCKET_ID;

export async function getQuestions(req, res) {
    const db = await database();
    const questionCollection = db.collection(`bucket_${QUESTION_BUCKET_ID}`);
    const questionsWithOptions = await questionCollection.aggregate([
        { $sample: { size: 5 } },
        {
            $set: {
                _id: { $toString: "$_id" }
            }
        },
        {
            $lookup: {
                from: `bucket_${OPTIONS_BUCKET_ID}`,
                localField: "_id",
                foreignField: "question",
                as: "options"
            }
        }
    ]).toArray();
    return res.send(questionsWithOptions);
}