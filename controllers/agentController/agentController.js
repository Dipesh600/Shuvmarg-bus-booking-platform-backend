const cloudinary = require("../../handlers/cloudinary.js");
const Agent = require("../../models/agentModel.js");

const uploadToCloudinary = async (file, folder) => {
    const base64 = `data:${file.mimetype};base64,${file.data.toString("base64")}`;
    const result = await cloudinary.uploader.upload(base64, {
        folder,
        overwrite: true,
    });
    return result.secure_url;
};

const uploadManyToCloudinary = async (files, folder) => {
    const fileArray = Array.isArray(files) ? files : [files];
    const urls = [];
    for (const file of fileArray) {
        const url = await uploadToCloudinary(file, folder);
        urls.push(url);
    }
    return urls;
};

const submitAgentKyc = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        let agent = await Agent.findOne({ user: userId });

        if (!agent) {
            agent = new Agent({ user: userId });
        }

        const files = req.files || {};
        const { agentCompanyName } = req.body;

        if (agentCompanyName) {
            agent.agentCompanyName = agentCompanyName;
        }


        if (files.citizenshipCertificate) {
            const urls = await uploadManyToCloudinary(
                files.citizenshipCertificate,
                "agent_kyc/citizenship"
            );
            agent.citizenshipCertificate = agent.citizenshipCertificate || {};
            agent.citizenshipCertificate.documentUrls = urls;
            agent.citizenshipCertificate.verified = false;
        }

        if (files.agentAgreement) {
            const urls = await uploadManyToCloudinary(
                files.agentAgreement,
                "agent_kyc/agreement"
            );
            agent.agentAgreement = agent.agentAgreement || {};
            agent.agentAgreement.documentUrls = urls;
            agent.agentAgreement.verified = false;
        }

        if (files.addressProof) {
            const urls = await uploadManyToCloudinary(
                files.addressProof,
                "agent_kyc/address_proof"
            );
            agent.addressProof = agent.addressProof || {};
            agent.addressProof.documentUrls = urls;
            agent.addressProof.verified = false;
        }

        if (files.bankDocument) {
            const urls = await uploadManyToCloudinary(
                files.bankDocument,
                "agent_kyc/bank"
            );
            agent.bankAccount = agent.bankAccount || {};
            agent.bankAccount.documentUrls = urls;
            agent.bankAccount.verificationReferenceId = null;
            agent.bankAccount.verified = false;
        }

        // When KYC is (re)submitted, reset verification status
        agent.verificationStatus = "pending";
        agent.rejectionReason = null;

        const savedAgent = await agent.save();

        return res.status(200).json({
            success: true,
            message: "Agent KYC submitted successfully",
            // data: savedAgent,
        });
    } catch (error) {
        console.error("submitAgentKyc error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

const getMyKycStatus = async (req, res) => {
    try {
        const userId = req.userInfo?.id;

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Unauthorized. Please login first.",
            });
        }

        const agent = await Agent.findOne({ user: userId }).lean();

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: "Agent KYC not found. Please submit your KYC.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Agent KYC status fetched successfully",
            data: {
                verificationStatus: agent.verificationStatus,
                rejectionReason: agent.rejectionReason,
                accountStatus: agent.accountStatus,
                agentCompanyName: agent.agentCompanyName,
                citizenshipCertificate: agent.citizenshipCertificate,
                agentAgreement: agent.agentAgreement,
                addressProof: agent.addressProof,
                bankAccount: agent.bankAccount,
                createdAt: agent.createdAt,
                updatedAt: agent.updatedAt,
            },
        });
    } catch (error) {
        console.error("getMyKycStatus error:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message,
        });
    }
};

module.exports = {
    submitAgentKyc,
    getMyKycStatus,
};