export function generateRandomString(length: number): string {
    const charset =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let randomString = "";

    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        randomString += charset[randomIndex];
    }

    return randomString;
}

interface EmailData {
    to: string;
    subject: string;
    message: string;
}

interface EmailResponse {
    success: boolean;
    message: string;
}

export const sendEmail = async (
    emailData: EmailData,
): Promise<EmailResponse> => {
    try {
        const response = await fetch(
            "https://davidnet.net/php-wrappers/Mail.php",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(emailData),
            },
        );

        const result = await response.json();
        if (result.status === "success") {
            return { success: true, message: "Email sent successfully!" };
        } else {
            return { success: false, message: result.message };
        }
    } catch (error: unknown) {
        return {
            success: false,
            message: "Error sending email: " + error,
        };
    }
};

export async function getCryptoKey(secret: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret); // Zet de secret om naar een Uint8Array

    return await crypto.subtle.importKey(
        "raw",                   // "raw" omdat het een geheim is
        keyData,                 // De geëncodeerde sleutel
        { name: "HMAC", hash: { name: "SHA-1" } },  // Algoritme en hashfunctie
        false,                   // De sleutel wordt niet gedeeld
        ["sign"]                 // De actie die de sleutel kan uitvoeren
    );
}
