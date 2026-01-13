const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

function must(name) {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set`);
    return v;
}

// Lazy init so server can start even without R2 env vars (will fail on usage)
let s3;
function getS3() {
    if (!s3) {
        s3 = new S3Client({
            region: "auto",
            endpoint: `https://${must("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
            credentials: {
                accessKeyId: must("R2_ACCESS_KEY_ID"),
                secretAccessKey: must("R2_SECRET_ACCESS_KEY"),
            },
        });
    }
    return s3;
}

function makeObjectKey({ userId, originalName }) {
    const ext = (originalName || "").split(".").pop();
    const safeExt = ext && ext.length <= 10 ? `.${ext.replace(/[^a-zA-Z0-9]/g, "")}` : "";
    return `u/${userId || "anon"}/${Date.now()}-${crypto.randomUUID()}${safeExt}`;
}

async function putBuffer({ key, buffer, contentType }) {
    await getS3().send(
        new PutObjectCommand({
            Bucket: must("R2_BUCKET"),
            Key: key,
            Body: buffer,
            ContentType: contentType,
        })
    );
}

async function presignGet({ key, filename, contentType, expiresIn = 60, forceDownload = false }) {
    // Cloudflare R2 supports response-content-disposition overrides in GetObject!
    // This allows clean download vs inline logic
    const disposition = forceDownload ? "attachment" : "inline";
    const cmd = new GetObjectCommand({
        Bucket: must("R2_BUCKET"),
        Key: key,
        ResponseContentDisposition: `${disposition}; filename="${filename.replace(/"/g, "")}"`,
        ResponseContentType: contentType,
    });
    return getSignedUrl(getS3(), cmd, { expiresIn });
}

module.exports = { putBuffer, presignGet, makeObjectKey };
