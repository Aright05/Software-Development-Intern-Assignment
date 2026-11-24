import { emailService } from '../services/emailService';
import { logger } from '../utils/logger';

async function main() {
  console.log('\n======================================================');
  console.log('ReachInbox Email Job Scheduler - Ethereal SMTP Test');
  console.log('======================================================\n');

  try {
    const testRecipient = process.argv[2] || 'ethereal.demo@reachinbox.ai';
    const testSubject = `ReachInbox Verification Test [${new Date().toLocaleTimeString()}]`;
    const testHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: #4f46e5; padding: 24px; text-align: center; color: #ffffff;">
          <h1 style="margin: 0; font-size: 22px; font-weight: 700;">ReachInbox Email Scheduler</h1>
          <p style="margin: 4px 0 0; font-size: 14px; opacity: 0.9;">High-Throughput Distributed Email Engine</p>
        </div>
        <div style="padding: 32px 24px; color: #1e293b; line-height: 1.6;">
          <h2 style="margin-top: 0; color: #0f172a; font-size: 18px;">SMTP Transmission Successful!</h2>
          <p>This verification email confirms that Nodemailer and Ethereal SMTP are functioning seamlessly.</p>
          <div style="background: #f8fafc; border-left: 4px solid #4f46e5; padding: 12px 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 0; font-size: 13px; color: #475569;">
              <strong>Recipient:</strong> ${testRecipient}<br/>
              <strong>Dispatched At:</strong> ${new Date().toISOString()}<br/>
              <strong>Transport Engine:</strong> Ethereal SMTP Sandbox (Nodemailer)
            </p>
          </div>
          <p style="font-size: 13px; color: #64748b;">
            All emails scheduled through BullMQ delayed queues pass through this atomic verification pipeline before being marked as SENT.
          </p>
        </div>
        <div style="background: #f1f5f9; padding: 16px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
          ReachInbox Job Scheduler &copy; ${new Date().getFullYear()} &bull; Assignment Phase 4 Verification
        </div>
      </div>
    `;

    logger.info(`Dispatching sample verification email to: ${testRecipient}...`, 'TestScript');

    const result = await emailService.sendWithSender(null, {
      to: testRecipient,
      subject: testSubject,
      html: testHtml,
    });

    console.log('\n----------------- DELIVERY CONFIRMATION -----------------');
    console.log(`Status:        SUCCESS (250 Message Accepted)`);
    console.log(`Message ID:    ${result.messageId}`);
    console.log(`Recipient:     ${testRecipient}`);
    console.log(`Dispatched At: ${result.timestamp}`);
    if (result.previewUrl) {
      console.log(`\n======================================================`);
      console.log(`ETHREALEAL WEB INBOX PREVIEW:`);
      console.log(`${result.previewUrl}`);
      console.log(`======================================================\n`);
    } else {
      console.log(`Preview:       Not available (standard SMTP)`);
    }

    process.exit(0);
  } catch (error) {
    logger.error('Failed to send test email:', 'TestScript', error);
    process.exit(1);
  }
}

main();
