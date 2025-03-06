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
