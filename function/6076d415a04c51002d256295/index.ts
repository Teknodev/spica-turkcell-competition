import * as Bucket from "@spica-devkit/bucket";
const XLSX = require("xlsx");
const fetch = require("node-fetch");

/* 
 - Headers of file must be same as bucket schema properties.
 - Replace custom environments from environment variables with yours.
 - Function excelImport will be executed after every INSERT request to Bucket Import Templates bucket.
 - If you want to use it, you only need to add an entry to the Bucket Import Template
*/

Bucket.initialize({ apikey: process.env.AUTH_APIKEY });

export async function excelImport(change) {
    console.log("@observer::excelImport");
    let promises = [];
    let result = false;

    if(change.current.bucket_id == "605c9772e9960e002c278196"){
        await importQuestions(change);
        return;
    }

    await fetch(change.current.file)
        .then(function(res) {
            // get the data as a Blob
            if (!res.ok) throw new Error("fetch failed");
            return res.arrayBuffer();
        })
        .then(async function(ab) {
            // parse the data when it is received
            var data = new Uint8Array(ab);
            var workbook = XLSX.read(data, {
                type: "array"
            });
            var first_sheet_name = workbook.SheetNames[0];

            // Get worksheet
            var worksheet = workbook.Sheets[first_sheet_name];
            // Convert to json
            var _JsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
            // Import data to bucket
            _JsonData.forEach(entry => {
                // For this project
                if (entry.option) entry.option = entry.option.toString();
                //
                promises.push(Bucket.data.insert(change.current.bucket_id, entry));
            });
            await Promise.all(promises)
                .then(data => {
                    result = true;
                    console.log("PROMISES INSERT DONE :", data);
                })
                .catch(e => {
                    result = false;
                    console.log("SOMETHING WENT WRONG WHEN INSERT", e);
                });

            return result;
        });
}

export async function deleteAllOptions(req, res) {
    console.log("@observer::deleteAllOptions");
    let promises = [];
    const optionsBucketId = "605c9772e9960e002c278196";
    let options = await Bucket.data.getAll(optionsBucketId, {
        queryParams: {
            limit: 5000
        }
    });
    options.forEach(o => promises.push(Bucket.data.remove(optionsBucketId, o._id)));
    await Promise.all(promises)
        .then(test => console.log("Promise done"))
        .catch(e => console.log("Promise ERROR", e));
    return res.status(200).send({ message: "Ok", data: options });
}

export async function importQuestions(change) {
    console.log("@observer::importQuestions");
    let promises = [];
    let answerPromises = [];
    let result = false;

    await fetch(change.current.file)
        .then(function(res) {
            // get the data as a Blob
            if (!res.ok) throw new Error("fetch failed");
            return res.arrayBuffer();
        })
        .then(async function(ab) {
            // parse the data when it is received
            var data = new Uint8Array(ab);
            var workbook = XLSX.read(data, {
                type: "array"
            });
            var first_sheet_name = workbook.SheetNames[0];

            // Get worksheet
            var worksheet = workbook.Sheets[first_sheet_name];
            // Convert to json
            var _JsonData = XLSX.utils.sheet_to_json(worksheet, { raw: true });
            // Import data to bucket
            _JsonData.forEach(entry => {
                // For this project
                if (entry.option) entry.option = entry.option.toString();
                // QuestionsBucketID = 605c9772e9960e002c278196;
                // AnswersBucketID = 605c98e2e9960e002c27819a;
                promises.push(Bucket.data.insert("605c9772e9960e002c278196", entry));
            });
            let columns = [
                "questionOpt1",
                "questionOpt2",
                "questionOpt3",
                "questionOpt4",
                "questionOpt5"
            ];
            await Promise.all(promises)
                .then(async data => {
                    result = true;
                    console.log("PROMISES INSERT DONE :", data);
                })
                .catch(e => {
                    result = false;
                    console.log("SOMETHING WENT WRONG WHEN INSERT", e);
                });

            let dataQuestions = await Bucket.data.getAll("605c9772e9960e002c278196");
            dataQuestions.forEach(question => {
                let originalQ = _JsonData.filter(entry => question.question.toString() == entry.question.toString());
                if(originalQ.length){
                    originalQ = originalQ[0];
                    columns.forEach(column => {
                        answerPromises.push(
                            Bucket.data.insert("605c98e2e9960e002c27819a", {
                                question: question._id,
                                is_right: originalQ[column].toString() == originalQ["answerOpt"].toString(),
                                option: originalQ[column].toString()
                            })
                        );
                    });
                }
            });
            console.log("answers length", answerPromises.length);
            await Promise.all(answerPromises)
                .then(() => {
                    console.log("QUESTIONS DONE");
                })
                .catch(e => console.log("QUESTON ERROR:", e));

            return result;
        });
}
