/**
 * Email service to handle invitations and notifications via Resend.
 */
const { Resend } = require('resend');
const logger = require('../../../../core/utils/logger');
require('dotenv').config();

// Initialize Resend (with a dummy key if missing to prevent startup crash, validate in send method)
const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_123456789');

exports.sendTenantInvitation = async (email) => {
    if (!email) {
        throw new Error('Email is required');
    }

    const from = process.env.EMAIL_FROM || 'onboarding@resend.dev';
    const replyTo = process.env.EMAIL_REPLY_TO;

    const frontendUrl = process.env.FRONTEND_URL || process.env.VITE_FRONTEND_URL || 'http://localhost:5173';
    const inviteLink = `${frontendUrl}/setup?email=${encodeURIComponent(email)}`;

    logger.info(`Sending invitation to ${email} with link: ${inviteLink}`);

    try {
        const { data, error } = await resend.emails.send({
            from,
            to: [email],
            replyTo,
            subject: 'You have been invited to MrLAD',
            html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #172560;">Welcome to MrLAD</h2>
          <p>Hello,</p>
          <p>You have been invited to join the MrLAD platform as an administrator for a new tenant organization.</p>
          <p>Please click the button below to secure your account, set your password, and configure your plan:</p>
          <div style="margin: 30px 0;">
            <a href="${inviteLink}" style="background-color: #172560; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Complete Account Setup</a>
          </div>
          <p style="font-size: 0.9em; color: #666;">If the button above doesn't work, copy and paste this link into your browser:<br/>${inviteLink}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 0.8em; color: #888;">This invitation was sent from MrLAD. If you did not expect this, please ignore this email.</p>
        </div>
      `
        });

        if (error) {
            logger.error('Resend API Error:', error);
            throw new Error(error.message);
        }

        return { success: true, id: data.id };
    } catch (err) {
        logger.error('Email service error:', err);
        throw err;
    }
};
