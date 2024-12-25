import { database } from '@spica-devkit/database';

const CHARGE_REPORT_BUCKET = process.env.CHARGE_REPORT_BUCKET;
const POOL_CHARGE_REPORT_BUCKET = process.env.POOL_CHARGE_REPORT_BUCKET;

export async function executeReportDaily() {
    console.log("@Daily Prize Pool Report");
    await prizePoolReport().catch(err => console.log("ERROR: 1", err));

    return true;
}

export async function executeReportWeekly() {
    await reportExportSendPool("Haftalık Toplam Hediye Havuzu Raporu", 1).catch(err => console.log("ERROR: 3", err));
    await reportExportSendPool("Haftalık Gün Bazlı Hediye Havuzu Raporu", 11).catch(err =>console.log("ERROR: 4", err));

    return true;
}
export async function executeReportMonthly() {
    await reportExportSendPool("Aylık Gün Bazlı Hediye Havuzu Raporu", 22).catch(err =>
        console.log("ERROR: 5", err)
    );
    await reportExportSendPool("Aylık Toplam Hediye Havuzu Raporu", 2).catch(err =>
        console.log("ERROR: 6", err)
    );

    return true;
}

async function prizePoolReport() {
    let date = new Date().setDate(new Date().getDate() - 1)
    let dateFrom = new Date(date).setHours(0, 0, 0);
    let dateTo = new Date(date).setHours(23, 59, 59);
    
    const db = await database().catch(console.error);
    const chargeReports = db.collection(`bucket_${CHARGE_REPORT_BUCKET}`);
    const poolChargeReports = db.collection(`bucket_${POOL_CHARGE_REPORT_BUCKET}`);

    const reportData = await chargeReports
        .find({ date: { $gte: new Date(dateFrom), $lt: new Date(dateTo) }, status: 'Başarılı' })
        .toArray().catch(err => console.log("ERROR 7: ", err));
    try {
        const data = {
            date: new Date(date),
            game: 'Bilgi Düellosu Hediye Havuzu',
            channel: 'Turkcell App',
            charge_amount: reportData[0].charge_amount,
            quantity: reportData[0].quantity,
            revenue: reportData[0].quantity * 20,
        }
        await poolChargeReports.insertOne(data);
        
    } catch (err) {
        console.log("ERROR 8: ", err);
    }
    return true;
}
//Admin's request handler function
export async function getPoolReport(req, res) {
    const dateFilter = req.body.dateFilter;
    const dateFrom = new Date(dateFilter.$gte);
    const dateTo = new Date(dateFilter.$lte);

    const db = await database();
    const chargeReports = db.collection(`bucket_${POOL_CHARGE_REPORT_BUCKET}`);
    const poolChargeReports = await chargeReports
        .find({ date: { $gte: dateFrom, $lte: dateTo } })  
        .toArray().catch(err => console.log("ERROR 9: ", err));
    
    return res.status(200).send(poolChargeReports);
}