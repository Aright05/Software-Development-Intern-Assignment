import nodemailer, { Transporter, SentMessageInfo } from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';
import { Sender } from '@prisma/client';

export interface SendMailOptions {
  to: string;
  from?: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface EmailDeliveryResult {
  success: boolean;
  messageId: string;
  previewUrl?: string | false;
  accepted: string[];
  rejected: string[];
  response: string;
  timestamp: string;
}

export class EmailService {
  private transporterPool: Map<string, Transporter> = new Map();
  private ephemeralEtherealAccount: { user: string; pass: string } | null = null;

  /**
   * Helper: Strips HTML tags to generate a clean plain text fallback
   */
  private generatePlainText(html?: string): string {
    if (!html) return '';
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Generates or retrieves an on-demand Ethereal test account if credentials are not configured
   */
  async getOrCreateEtherealAccount(): Promise<{ user: string; pass: string }> {
    if (config.smtp.user && config.smtp.pass) {
      return { user: config.smtp.user, pass: config.smtp.pass };
    }

    if (this.ephemeralEtherealAccount) {
      return this.ephemeralEtherealAccount;
    }

    logger.info('No SMTP credentials in environment. Creating automated Ethereal test account...', 'EmailService');
    const testAccount = await nodemailer.createTestAccount();
    this.ephemeralEtherealAccount = {
      user: testAccount.user,
      pass: testAccount.pass,
    };

    logger.info(`Ethereal Test Account auto-provisioned: ${testAccount.user}`, 'EmailService');
    return this.ephemeralEtherealAccount;
  }

  /**
   * Retrieves or builds a cached Transporter for a specific Sender identity
   */
  async getTransporterForSender(sender?: Sender | null): Promise<Transporter> {
    const poolKey = sender?.id || 'default_system_smtp';

    if (this.transporterPool.has(poolKey)) {
      return this.transporterPool.get(poolKey)!;
    }

    let host = sender?.smtpHost || config.smtp.host;
    let port = sender?.smtpPort || config.smtp.port;
    let secure = sender?.smtpSecure !== undefined ? sender.smtpSecure : config.smtp.secure;
    let user = sender?.smtpUser || config.smtp.user;
    let pass = sender?.smtpPass || config.smtp.pass;

    // If still missing credentials, auto-provision Ethereal credentials
    if (!user || !pass) {
      const ethereal = await this.getOrCreateEtherealAccount();
      host = 'smtp.ethereal.email';
      port = 587;
      secure = false;
      user = ethereal.user;
      pass = ethereal.pass;
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });

    this.transporterPool.set(poolKey, transporter);
    return transporter;
  }

  /**
   * Dispatches an email using a specific Sender configuration
   */
  async sendWithSender(sender: Sender | null, options: SendMailOptions): Promise<EmailDeliveryResult> {
    const transporter = await this.getTransporterForSender(sender);
    const fromAddress = sender
      ? `"${sender.name}" <${sender.email}>`
      : options.from || config.smtp.from;

    const htmlContent = options.html || (options.text ? `<p>${options.text}</p>` : '');
    const textContent = options.text || this.generatePlainText(options.html);

    logger.info(`Transmitting email to [${options.to}] from [${fromAddress}] (Subject: "${options.subject}")`, 'EmailService');

    const info: SentMessageInfo = await transporter.sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: htmlContent,
      text: textContent,
    });

    // Generate Ethereal Preview URL
    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      logger.info(`Ethereal Email Preview URL: ${previewUrl}`, 'EmailService');
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
      accepted: (info.accepted as string[]) || [options.to],
      rejected: (info.rejected as string[]) || [],
      response: info.response || '250 Message accepted',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Fallback sendEmail method maintaining backwards compatibility
   */
  async sendEmail(options: SendMailOptions): Promise<{ messageId: string; previewUrl?: string | false }> {
    const result = await this.sendWithSender(null, options);
    return {
      messageId: result.messageId,
      previewUrl: result.previewUrl,
    };
  }

  /**
   * Validates SMTP connectivity
   */
  async verifyConnection(sender?: Sender | null): Promise<boolean> {
    try {
      const transporter = await this.getTransporterForSender(sender);
      await transporter.verify();
      logger.info('SMTP connection verified successfully.', 'EmailService');
      return true;
    } catch (error) {
      logger.warn('SMTP verification failed:', 'EmailService', error);
      return false;
    }
  }
}

export const emailService = new EmailService();
