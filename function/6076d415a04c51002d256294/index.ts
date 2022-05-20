import { database, ObjectId } from "@spica-devkit/database";
import * as Bucket from "@spica-devkit/bucket";
const json2csv = require("json2csv").parse;
const admz = require("adm-zip");

/*

 FIRSTLY RUN THIS API  https://`${YOUR DOMAIN}/api/fn-execute/initializeExportExcel` 
  This mean you can get entries with download link for all buckets in Exporter-Templates bucket.

 line:31 key:bucketId description : Must be a string
 line:31 key:columns description : Must be a string with ',' of between they . For example `_id,first_name,email`.
 line:31 key:queryFilter decription : Must be an object . For example  {"email":"test@123"}


 This function can callable like  :
  https://${YOUR DOMAIN}/api/fn-execute/excelExport?bucketId=60645720a37829002c4a510e&columns=email,first_name&queryFilter={"email":"test@123"}
  The links will already be available in the Exporter-Templates bucket after you trigger the initializeExportExcel function.

 You can change the format of the file in the environment variable. Acceptable formats are xls or csv.

    You can also restart the initializeExportExcel function, but this time the function will delete the items
    it has created and will create again. Note that : Auto-created items are auto marked items.

    Don't remember change all custom fields with yours !


    */

Bucket.initialize({ apikey: process.env.AUTH_APIKEY });

export async function excelExport(req, res) {
    const { bucketId, columns, queryFilter } = req.query;

    //If columns are null, function will export all columns.
    //If queryFilter is null, function will export all data.

    let schema = await Bucket.get(bucketId).catch(e => {
        return res.status(400).send({ message: e });
    });

    let datas = await Bucket.data
        .getAll(bucketId, {
            queryParams: {
                filter: queryFilter
            }
        })
        .catch(e => {
            return res.status(400).send({ message: e });
        });
    let headers = Object.keys(schema.properties); // Get properties
    headers.push("_id");
    let formattedString;
    if (datas[0]) {
        if (columns && columns != "null") {
            let columnsArr = columns.split(",");
            headers = columnsArr;
        }

        formattedString = json2csv(datas, { fields: headers });
        headers.forEach(item => {
            formattedString = formattedString.replace(item, item.replace("_", " ").toUpperCase());
            // Setting headers of csv, for example "_id" and "first_name" keys will be "ID" AND "FIRST NAME" header.
        });
        var zp = new admz();

        switch (`${process.env.FORMAT_TYPE}`) {
            case "xls":
                zp.addFile(
                    "download-" + Date.now() + ".xlsx",
                    Buffer.alloc(formattedString.length, formattedString),
                    "entry comment goes here"
                );
                break;
            case "csv":
                zp.addFile(
                    "download-" + Date.now() + ".csv",
                    Buffer.alloc(formattedString.length, formattedString),
                    "entry comment goes here"
                );
                break;
        }
        res.headers.set(
            "Content-Disposition",
            "attachment; filename=download-" + Date.now() + ".zip"
        );
        res.headers.set("Content-Type", "application/octet-stream");
        formattedString = zp.toBuffer();
        return res.status(200).send(formattedString);
    }
    return res.status(400).send({ message: "There is no data" });
}

export async function initialize(req, res) {
    const DOMAIN = req.headers.get("host");
    let buckets = await Bucket.getAll();
    let promisesAdd = [];
    let promisesDelete = [];

    let existEntries = await Bucket.data.getAll(`${process.env.BUCKET_EXPORT_TEMPLATES}`, {
        queryParams: {
            filter: {
                auto: true
            }
        }
    });
    if (existEntries.length) {
        existEntries.forEach(entry => {
            promisesDelete.push(
                Bucket.data.remove(`${process.env.BUCKET_EXPORT_TEMPLATES}`, entry._id)
            );
        });
        await Promise.all(promisesDelete)
            .then(data => console.log("PROMISES DELETE DONE"))
            .catch(e => console.log("SOMETHING WENT WRONG WHEN DELETE", e));
    }

    if (buckets.length) {
        let hrefLink;
        buckets.forEach(bucket => {
            if (bucket._id != `${process.env.BUCKET_EXPORT_TEMPLATES}`) {
                hrefLink = `https://${DOMAIN}/api/fn-execute/excelExport?bucketId=${bucket._id}&columns=null&queryFilter=null`;
                let entry = {
                    title: bucket.title + "`s Export",
                    link: `<a href=${hrefLink} target="_blank">Download</a>`,
                    auto: true
                };
                promisesAdd.push(
                    Bucket.data.insert(`${process.env.BUCKET_EXPORT_TEMPLATES}`, entry)
                );
            }
        });
        await Promise.all(promisesAdd)
            .then(data => console.log("PROMISES INSERT DONE :", data))
            .catch(e => console.log("SOMETHING WENT WRONG WHEN INSERT", e));
    }

    return res.status(200).send({ message: "Ok" });
}

export async function updateLink(change) {
    const pre_doc = change.previous;
    let cur_doc = change.current;
    if (
        (cur_doc.from_date && pre_doc.from_date != cur_doc.from_date) ||
        (cur_doc.to_date && pre_doc.to_date != cur_doc.to_date) ||
        (cur_doc.property_name && pre_doc.property_name != cur_doc.property_name)
    ) {
        let old_link = pre_doc.link.split("queryFilter=")[1].split(" ")[0];
        let new_link = `{"${cur_doc.property_name}":{"$gte":"Date(${cur_doc.from_date})","$lt":"Date(${cur_doc.to_date})"}}`;
        cur_doc.link = cur_doc.link
            .split(`queryFilter=${old_link}`)
            .join(`queryFilter=${new_link}`);
        Bucket.data.update(`${process.env.BUCKET_EXPORT_TEMPLATES}`, cur_doc._id, cur_doc);
    }
    return {};
}

// const dataset = [
//     { "msisdn": "5465666956", "date": "01/26/2022 17:46:29", "Oyun": "duello" },
//     { "msisdn": "5466114497", "date": "01/29/2022 15:42:41", "Oyun": "duello" },
//     { "msisdn": "5526295678", "date": "01/03/2022 15:50:02", "Oyun": "duello" },
//     { "msisdn": "5306211744", "date": "01/03/2022 15:27:12", "Oyun": "duello" },
//     { "msisdn": "5309751632", "date": "01/27/2022 00:51:20", "Oyun": "duello" },
//     { "msisdn": "5316270842", "date": "01/23/2022 14:38:27", "Oyun": "duello" },
//     { "msisdn": "5340659647", "date": "01/28/2022 05:45:05", "Oyun": "duello" },
//     { "msisdn": "5434090277", "date": "01/27/2022 20:38:53", "Oyun": "duello" },
//     { "msisdn": "5427902070", "date": "01/30/2022 23:26:56", "Oyun": "duello" },
//     { "msisdn": "5384103430", "date": "01/29/2022 14:32:22", "Oyun": "duello" },
//     { "msisdn": "5325471942", "date": "01/18/2022 17:40:12", "Oyun": "duello" },
//     { "msisdn": "5366142279", "date": "01/23/2022 16:13:30", "Oyun": "duello" },
//     { "msisdn": "5302411026", "date": "01/09/2022 19:17:09", "Oyun": "duello" },
//     { "msisdn": "5462347230", "date": "01/06/2022 20:01:24", "Oyun": "duello" },
//     { "msisdn": "5369744788", "date": "01/27/2022 00:30:57", "Oyun": "duello" },
//     { "msisdn": "5301713543", "date": "01/18/2022 13:34:23", "Oyun": "duello" },
//     { "msisdn": "5330117417", "date": "01/24/2022 09:17:41", "Oyun": "duello" },
//     { "msisdn": "5365126201", "date": "01/21/2022 19:50:41", "Oyun": "duello" },
//     { "msisdn": "5301285118", "date": "01/02/2022 18:27:18", "Oyun": "duello" },
//     { "msisdn": "5370613320", "date": "01/09/2022 12:46:31", "Oyun": "duello" },
//     { "msisdn": "5312678954", "date": "01/22/2022 16:32:17", "Oyun": "duello" },
//     { "msisdn": "5462388544", "date": "01/03/2022 14:14:59", "Oyun": "duello" },
//     { "msisdn": "5398689207", "date": "01/28/2022 22:41:17", "Oyun": "duello" },
//     { "msisdn": "5536827658", "date": "01/19/2022 18:12:52", "Oyun": "duello" },
//     { "msisdn": "5050074607", "date": "01/30/2022 00:19:27", "Oyun": "duello" },
//     { "msisdn": "5344494553", "date": "01/27/2022 20:10:13", "Oyun": "duello" },
//     { "msisdn": "5338977236", "date": "01/24/2022 12:13:24", "Oyun": "duello" },
//     { "msisdn": "5356943390", "date": "01/22/2022 23:51:13", "Oyun": "duello" },
//     { "msisdn": "5423324052", "date": "01/07/2022 18:19:30", "Oyun": "duello" },
//     { "msisdn": "5524228632", "date": "01/10/2022 19:58:32", "Oyun": "duello" },
//     { "msisdn": "5367182530", "date": "01/11/2022 18:10:04", "Oyun": "duello" },
//     { "msisdn": "5350715046", "date": "01/26/2022 11:16:20", "Oyun": "duello" },
//     { "msisdn": "5304266352", "date": "01/17/2022 02:07:34", "Oyun": "duello" },
//     { "msisdn": "5384937453", "date": "01/04/2022 12:33:47", "Oyun": "duello" },
//     { "msisdn": "5309731298", "date": "01/20/2022 16:41:06", "Oyun": "duello" },
//     { "msisdn": "5395672557", "date": "01/26/2022 11:07:27", "Oyun": "duello" },
//     { "msisdn": "5382079568", "date": "01/11/2022 22:56:42", "Oyun": "duello" },
//     { "msisdn": "5443100864", "date": "01/12/2022 00:45:43", "Oyun": "duello" },
//     { "msisdn": "5412153430", "date": "01/25/2022 00:05:10", "Oyun": "duello" },
//     { "msisdn": "5337442328", "date": "01/25/2022 00:10:28", "Oyun": "duello" },
//     { "msisdn": "5355885981", "date": "01/31/2022 08:53:51", "Oyun": "duello" },
//     { "msisdn": "5417300081", "date": "01/30/2022 16:47:18", "Oyun": "duello" },
//     { "msisdn": "5435809853", "date": "01/22/2022 09:20:09", "Oyun": "duello" },
//     { "msisdn": "5435799982", "date": "01/25/2022 22:28:16", "Oyun": "duello" },
//     { "msisdn": "5340835865", "date": "01/22/2022 20:17:11", "Oyun": "duello" },
//     { "msisdn": "5331568642", "date": "01/18/2022 18:58:37", "Oyun": "duello" },
//     { "msisdn": "5374766262", "date": "01/23/2022 11:56:35", "Oyun": "duello" },
//     { "msisdn": "5373897223", "date": "01/09/2022 18:41:21", "Oyun": "duello" },
//     { "msisdn": "5303252040", "date": "01/09/2022 21:31:44", "Oyun": "duello" },
//     { "msisdn": "5363960184", "date": "01/09/2022 18:52:18", "Oyun": "duello" },
//     { "msisdn": "5340531935", "date": "01/22/2022 09:44:30", "Oyun": "duello" },
//     { "msisdn": "5395531052", "date": "01/20/2022 18:56:31", "Oyun": "duello" },
//     { "msisdn": "5423511413", "date": "01/26/2022 17:46:02", "Oyun": "duello" },
//     { "msisdn": "5436812713", "date": "01/29/2022 02:38:09", "Oyun": "duello" },
//     { "msisdn": "5535375320", "date": "01/24/2022 00:26:26", "Oyun": "duello" },
//     { "msisdn": "5427639453", "date": "01/24/2022 01:35:19", "Oyun": "duello" },
//     { "msisdn": "5325264463", "date": "01/04/2022 19:49:47", "Oyun": "duello" },
// ]

// export async function checkTcellMsisdns(req, res) {
//     let db = await database().catch(err => console.log("ERROR ", err));
//     let chargeCollection = db.collection(`bucket_60ab7235c03a2d002eb2f574`);
//     let rewrdsCollection = db.collection(`bucket_609669f805b0df002ceb2517`);

//     let result = []

//     for (let item of dataset) {
//         let date = new Date(item.date)
//         date.setHours(date.getHours() - 3)
//         let date1 = new Date(date);
//         date1.setSeconds(date1.getSeconds() - 20)
//         let date2 = new Date(date);
//         date2.setSeconds(date2.getSeconds() + 20)

//         let dateFilter = {
//             $gte: new Date(date1),
//             $lt: new Date(date2)
//         };

//         const chargeData = await chargeCollection.findOne({ msisdn: `90${item.msisdn}`, date: dateFilter }).catch(err => console.log("ERROR"))
//         const rewardsData = await rewrdsCollection.findOne({ msisdn: `90${item.msisdn}`, date: dateFilter }).catch(err => console.log("ERROR"))

//         let obj = {
//             msisdn: item.msisdn,
//         }
//         if (chargeData) {
//             obj['charge_status'] = chargeData.status;
//             obj['charge_error'] = chargeData.user_text;
//         }
//         if (rewardsData) {
//             obj['reward_status'] = rewardsData.status;
//             obj['reward_error'] = rewardsData.user_text;
//         }

//         result.push(obj)
//     }

//     return result
// }


export async function exportConfrimationCodes(req, res) {
    // if (req.query.index) {
    //     let index = Number(req.query.index);
    let dateFilter = {
        $gte: new Date(`08-25-2021 21:00:00`),
        $lte: new Date(`08-31-2021 21:00:00`)
    };

    const db = await database();

    const collection = db.collection(`bucket_609669f805b0df002ceb2517`);
    const datas = await collection.find({
        date: dateFilter
    }).toArray();
    let formattedString = json2csv(datas, { fields: ['offer_id', 'order_id', 'msisdn', 'error_id', 'user_text', 'date', 'status', 'match_id', 'result'] });


    var zp = new admz();

    zp.addFile(
        "download-" + Date.now() + ".csv",
        Buffer.alloc(formattedString.length, formattedString),
        "entry comment goes here"
    );
    
    res.headers.set(
        "Content-Disposition",
        "attachment; filename=download-" + Date.now() + ".zip"
    );
    res.headers.set("Content-Type", "application/octet-stream");
    formattedString = zp.toBuffer();
    return res.status(200).send(formattedString);
    // }
    // return true
}


export async function exportConfrimationCodesDelete(req, res) {
    const db = await database();

    const collection = db.collection(`bucket_609669f805b0df002ceb2517`);
    const count = await collection.estimatedDocumentCount();
    console.log(count)

    // let dateFilter = {
    //     $gte: new Date('05-01-2021 20:00:00'),
    //     $lte: new Date('08-30-2021 21:00:00')
    // };
    // await collection.deleteMany({
    //     date: dateFilter
    // }).catch((err) => console.log("ERROR", err))

    return true;
}