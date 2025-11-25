import { Router } from 'express'
import nodemailer from 'nodemailer'

const router = Router()

// Configure email transporter
// For production, set these environment variables:
// EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS
const getTransporter = () => {
  // Check if email is configured
  if (process.env.EMAIL_HOST && process.env.EMAIL_USER) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT || 587,
      secure: process.env.EMAIL_PORT === '465',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    })
  }

  // For Gmail (set EMAIL_USER and EMAIL_PASS with app password)
  if (process.env.GMAIL_USER && process.env.GMAIL_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS  // Use App Password, not regular password
      }
    })
  }

  // Fallback: Use ethereal for testing (emails go to ethereal.email)
  return null
}

// Send results PDF via email
router.post('/send-results', async (req, res) => {
  try {
    const { email, pdfBase64, tournamentName, recipientName } = req.body

    if (!email || !pdfBase64) {
      return res.status(400).json({ error: 'Email and PDF data required' })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' })
    }

    let transporter = getTransporter()
    let testAccount = null

    // If no transporter configured, create ethereal test account
    if (!transporter) {
      testAccount = await nodemailer.createTestAccount()
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      })
    }

    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.GMAIL_USER || '"Scramble Buddy" <results@scramblebuddy.app>',
      to: email,
      subject: `${tournamentName || 'Golf Round'} - Results`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #1a1a2e, #16213e); padding: 30px; text-align: center;">
            <h1 style="margin: 0;">
              <span style="color: #228B22; font-size: 28px;">Scramble</span>
              <span style="color: #FFD700; font-size: 28px;">Buddy</span>
            </h1>
          </div>
          <div style="padding: 30px; background: #f9f9f9;">
            <p style="font-size: 16px; color: #333;">
              ${recipientName ? `Hey ${recipientName},` : 'Hey there,'}
            </p>
            <p style="font-size: 16px; color: #333;">
              Here are the results from <strong>${tournamentName || 'your round'}</strong>!
            </p>
            <p style="font-size: 14px; color: #666;">
              The full scorecard is attached as a PDF.
            </p>
            <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
            <p style="font-size: 12px; color: #999; text-align: center;">
              Sent via Scramble Buddy - The best golf tournament app for you and your buddies
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: `${(tournamentName || 'round').replace(/\s+/g, '_')}_results.pdf`,
          content: pdfBase64,
          encoding: 'base64',
          contentType: 'application/pdf'
        }
      ]
    }

    const info = await transporter.sendMail(mailOptions)

    // If using ethereal, provide preview URL
    const response = {
      success: true,
      message: 'Email sent successfully'
    }

    if (testAccount) {
      response.previewUrl = nodemailer.getTestMessageUrl(info)
      response.note = 'Email sent to test server. Configure SMTP for production.'
      console.log('Preview URL:', response.previewUrl)
    }

    res.json(response)
  } catch (error) {
    console.error('Email error:', error)
    res.status(500).json({
      error: 'Failed to send email',
      details: error.message,
      hint: 'Set up GMAIL_USER and GMAIL_PASS environment variables for production use'
    })
  }
})

export default router
