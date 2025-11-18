# AIVA Support - Standard Operating Procedures (SOP)

## 📋 Table of Contents

1. [Support Ticket Handling](#support-ticket-handling)
2. [Initial Response Guidelines](#initial-response-guidelines)
3. [Information Gathering](#information-gathering)
4. [Resolution Process](#resolution-process)
5. [Escalation Procedures](#escalation-procedures)
6. [Documentation Requirements](#documentation-requirements)
7. [Customer Communication](#customer-communication)
8. [Quality Assurance](#quality-assurance)

---

## Support Ticket Handling

### Ticket Categories

| Category | Description | Priority | SLA |
|----------|-------------|----------|-----|
| System Outage | Platform completely down | P1 | 1 hour |
| Agent Issues | Agent not working properly | P2 | 4 hours |
| Integration Issues | Shopify, Chat widget problems | P2 | 4 hours |
| Knowledge Base | Document upload, search issues | P3 | 24 hours |
| User Management | Login, permissions issues | P3 | 24 hours |
| Billing | Credits, payments | P2 | 4 hours |
| Feature Request | New features | P4 | 72 hours |
| General Question | How-to questions | P4 | 24 hours |

### Ticket Workflow

```
NEW TICKET RECEIVED
    ↓
1. ACKNOWLEDGE (< 30 minutes)
   - Auto-reply or personal response
   - Set expectations
    ↓
2. CATEGORIZE & PRIORITIZE
   - Assign priority (P1-P4)
   - Assign category
   - Set due date
    ↓
3. INITIAL INVESTIGATION
   - Gather information
   - Reproduce issue
   - Check knowledge base
    ↓
4. ATTEMPT RESOLUTION
   - Follow troubleshooting guide
   - Test solution
   - Document steps
    ↓
5. RESPOND TO CUSTOMER
   - Explain solution
   - Provide instructions
   - Ask for confirmation
    ↓
6. VERIFY RESOLUTION
   - Confirm with customer
   - Test if possible
    ↓
7. CLOSE TICKET
   - Document resolution
   - Update knowledge base if needed
   - Request feedback
```

---

## Initial Response Guidelines

### Response Templates

#### Acknowledgment (Auto or Manual)
```
Subject: Re: [Original Subject] - Ticket #[NUMBER]

Hello [Customer Name],

Thank you for contacting AIVA Support. We've received your request and assigned it ticket number #[NUMBER].

Priority Level: [P1/P2/P3/P4]
Expected Response Time: [Time based on priority]

We're looking into your issue and will update you shortly with our findings.

If this is urgent, please reply with "URGENT" and we'll prioritize accordingly.

Best regards,
AIVA Support Team
support@contegris.com
```

#### P1 - Critical Issue
```
Subject: [URGENT] Re: [Original Subject] - Ticket #[NUMBER]

Hello [Customer Name],

We understand this is affecting your business operations. This has been escalated to our senior team and we're actively investigating.

Current Status: Under investigation
Next Update: Within 30 minutes
Direct Contact: [Support Agent Name] - [Email]

We'll keep you updated every 30 minutes until resolved.

Best regards,
AIVA Support Team
```

#### Request for Information
```
Subject: Re: [Original Subject] - Ticket #[NUMBER] - Need More Info

Hello [Customer Name],

Thank you for reaching out. To help resolve this quickly, we need some additional information:

1. [Specific question 1]
2. [Specific question 2]
3. [Specific question 3]

Additionally, if possible, please provide:
- Screenshot of any error messages
- Agent ID or name (found in Agents page)
- Steps to reproduce the issue
- When this started happening

This will help us diagnose and resolve your issue faster.

Best regards,
AIVA Support Team
```

---

## Information Gathering

### Standard Information Checklist

For every ticket, gather:

#### User Information
```
☐ Customer Name
☐ Email Address
☐ Organization/Tenant Name
☐ User Role (Admin, Agent Manager, Client)
☐ Tenant ID (from database if needed)
```

#### Issue Information
```
☐ What is not working?
☐ What is the expected behavior?
☐ What actually happens?
☐ When did this start?
☐ Is it consistent or intermittent?
☐ How many users affected?
☐ Any recent changes made?
```

#### Technical Information
```
☐ Agent ID (if applicable)
☐ Knowledge Base ID (if applicable)
☐ Browser and version
☐ Operating System
☐ Error messages (exact text or screenshot)
☐ Console errors (F12 → Console)
☐ Network errors (F12 → Network)
```

#### Reproduction Steps
```
☐ Can you reproduce the issue?
☐ Steps to reproduce?
☐ Does it happen every time?
☐ Only in specific conditions?
```

### Information Gathering Questions by Issue Type

#### Agent Not Responding
```
1. What is the Agent ID or name?
2. When did this start?
3. Is the agent status "Active" in the dashboard?
4. Do you see any error messages?
5. Have you checked your credit balance?
6. Does it work in Test Chat/Test Call?
```

#### Knowledge Base Issues
```
1. What is the Knowledge Base name/ID?
2. Which document(s) are affected?
3. What was the file size and format?
4. What status does the document show? (Processing/Completed/Failed)
5. Can you reproduce by uploading a different document?
6. What search query are you using?
```

#### Integration Issues
```
1. Which integration? (Shopify, Chat Widget, etc.)
2. When was it last working?
3. Have credentials been changed recently?
4. Can you provide the exact error message?
5. Have you tested the connection?
```

---

## Resolution Process

### Step-by-Step Resolution

#### Step 1: Reproduce the Issue
```
1. Log into user's account (with permission) or test account
2. Follow exact steps user provided
3. Observe the behavior
4. Note any error messages
5. Check browser console for errors
6. Check network tab for failed requests

Document: Could you reproduce? Yes/No
If No: Request more details from user
```

#### Step 2: Diagnose Root Cause
```
Use Troubleshooting Guide:
1. Check service status (pm2 status)
2. Review relevant logs (pm2 logs)
3. Query database for status
4. Test individual components
5. Check configuration settings

Identify: What is the root cause?
```

#### Step 3: Determine Solution
```
Based on diagnosis:
- Configuration change needed?
- Service restart required?
- Bug that needs development fix?
- User error/misunderstanding?
- Missing feature?

Select appropriate solution from:
- Quick fix (< 5 min)
- Standard fix (5-30 min)
- Complex fix (30-60 min)
- Requires escalation
```

#### Step 4: Implement Solution
```
1. Backup current state if making changes
2. Apply fix following procedures
3. Test that fix works
4. Verify no new issues introduced
5. Document exact steps taken

CRITICAL: Always test before responding to customer
```

#### Step 5: Communicate Solution
```
Write clear response:
1. Acknowledge the issue
2. Explain what was wrong
3. Describe what was fixed
4. Provide any necessary steps for user
5. Mention how to avoid in future
6. Ask them to confirm it's working

Use simple, non-technical language when possible
```

---

## Escalation Procedures

### When to Escalate

**Escalate Immediately (P1):**
- System-wide outage
- Security breach suspected
- Data loss or corruption
- Unable to resolve within SLA
- Customer is very upset/threatening to leave

**Escalate Within 4 Hours (P2):**
- Issue affects multiple customers
- Complex technical issue beyond your knowledge
- Requires database schema changes
- Requires code changes
- Unable to resolve with standard procedures

**Escalate Within 24 Hours (P3):**
- Feature request that should be tracked
- Bug that needs development attention
- Recurring issue that needs permanent fix

### How to Escalate

#### Internal Escalation (to Senior Support)
```
Subject: ESCALATION - Ticket #[NUMBER] - [Brief Description]

Ticket Number: #[NUMBER]
Priority: [P1/P2/P3]
Customer: [Name] ([Email])
Issue: [Brief description]

What We Know:
- [Bullet points of facts]

What We've Tried:
- [Bullet points of troubleshooting steps]
- [Results of each attempt]

Current Status:
- [Where things stand now]

Why Escalating:
- [Reason for escalation]

Supporting Information:
- [Logs, screenshots, database queries]
- [Error messages]
- [Reproduction steps]

Urgency:
- Business impact: [High/Medium/Low]
- Customer sentiment: [Calm/Frustrated/Angry]
- SLA deadline: [Time remaining]
```

#### Escalation to Development
```
Subject: DEV ESCALATION - [Brief Description] - Ticket #[NUMBER]

Ticket Number: #[NUMBER]
Customer Affected: [Name]
Issue Type: [Bug / Feature Request / Performance]

Description:
[Clear description of the issue]

Steps to Reproduce:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Expected Behavior:
[What should happen]

Actual Behavior:
[What actually happens]

Technical Details:
- Component: [API/Frontend/Python/Bridge/Database]
- Error Message: [Exact error]
- Log Excerpts: [Relevant logs]
- Database State: [Relevant query results]

Workaround:
[If any workaround exists]

Priority Justification:
[Why this priority level]

Customer Impact:
[How this affects customer's business]

Attachments:
- [Screenshots]
- [Log files]
- [Database dumps]
```

### Escalation Communication

**To Customer:**
```
Subject: Re: [Original Subject] - Ticket #[NUMBER] - Escalated

Hello [Customer Name],

I've been working on your issue and have escalated it to our [senior team/development team] for specialized attention.

What We Found:
[Brief non-technical explanation]

Next Steps:
[What will happen next]

Timeline:
[When they can expect update]

In the meantime, [any workaround if available]

You'll be updated by [time/date] with progress.

If you have any questions, please don't hesitate to ask.

Best regards,
[Your Name]
AIVA Support Team
```

---

## Documentation Requirements

### What to Document

#### In Ticket System
```
☐ Initial report details
☐ All customer communications
☐ Troubleshooting steps taken
☐ Diagnostic findings
☐ Solution implemented
☐ Customer confirmation
☐ Time spent
☐ Resolution date
```

#### In Internal Notes
```
☐ Technical details (for team reference)
☐ Root cause analysis
☐ Why previous attempts failed
☐ Unusual circumstances
☐ Tips for future similar issues
```

#### In Knowledge Base (if new issue)
```
☐ Problem description
☐ Symptoms
☐ Diagnostic steps
☐ Solution
☐ Prevention tips
☐ Related articles
```

### Documentation Standards

**Be Specific:**
```
❌ Bad: "Restarted the service"
✅ Good: "Restarted API service using: pm2 restart api"

❌ Bad: "Fixed configuration"
✅ Good: "Changed max_tokens from 4096 to 1024 in agent settings"

❌ Bad: "User had wrong settings"
✅ Good: "Knowledge Base Search was disabled. Enabled in Agent > Settings > Tools"
```

**Include Context:**
```
✅ Before state: "Agent was not responding, status showed 'Active'"
✅ What was wrong: "API credits balance was $0.00"
✅ What fixed it: "Added $100 credits to tenant account"
✅ After state: "Agent now responding normally in test"
```

**Use Templates:**
```
Resolution Template:

Issue: [Brief description]
Root Cause: [What was wrong]
Solution: [What fixed it]
Steps Taken:
1. [Step 1]
2. [Step 2]
3. [Step 3]

Verification: [How we confirmed fix]
Prevention: [How to avoid in future]
```

---

## Customer Communication

### Communication Principles

1. **Be Prompt:** Respond within SLA timeframes
2. **Be Clear:** Use simple language, avoid jargon
3. **Be Empathetic:** Acknowledge frustration
4. **Be Honest:** Don't promise what you can't deliver
5. **Be Proactive:** Update even if no progress
6. **Be Professional:** Always courteous and helpful

### Language Guidelines

**Use Positive Language:**
```
❌ "We can't do that"
✅ "What we can do is..."

❌ "That's impossible"
✅ "Here's an alternative approach..."

❌ "You should have..."
✅ "For best results, try..."
```

**Acknowledge Before Correcting:**
```
❌ "You're wrong about..."
✅ "I understand why that seems like it should work. However..."

❌ "That's not how it works"
✅ "Actually, it works a bit differently..."
```

**Manage Expectations:**
```
✅ "This typically takes 15-30 minutes to resolve"
✅ "I'll update you by 3pm today, even if we're still investigating"
✅ "If this doesn't work, we have other options to try"
```

### Communication Frequency

**P1 - Critical Issues:**
- Initial response: < 30 minutes
- Updates: Every 30 minutes until resolved
- Even if no progress: "Still investigating..."

**P2 - High Priority:**
- Initial response: < 2 hours
- Updates: Every 4 hours
- At least 2 updates before SLA deadline

**P3/P4 - Medium/Low Priority:**
- Initial response: < 4-24 hours
- Updates: As needed, at least once daily
- Proactive update if taking longer than expected

---

## Quality Assurance

### Pre-Resolution Checklist

Before closing a ticket:
```
☐ Issue fully resolved (not just worked around)
☐ Solution tested and verified
☐ Customer confirmed it's working
☐ Documentation complete
☐ Root cause identified and noted
☐ Prevention steps communicated
☐ Similar tickets checked for patterns
```

### Post-Resolution Review

After ticket closed:
```
☐ Was SLA met?
☐ Could resolution have been faster?
☐ Should this be added to knowledge base?
☐ Do we need to improve documentation?
☐ Is this a recurring issue?
☐ Should development be notified?
```

### Quality Metrics

Track these metrics:
```
- Average First Response Time
- Average Resolution Time
- SLA Compliance Rate
- Customer Satisfaction Score
- Escalation Rate
- Reopened Ticket Rate
- Self-Service Resolution Rate
```

### Continuous Improvement

Weekly Review:
```
1. What were the most common issues?
2. What took longest to resolve?
3. What could be documented better?
4. What new procedures are needed?
5. What training is needed?
```

---

## Support Ticket Template

Use this template for consistency:

```markdown
# Support Ticket #[NUMBER]

## Customer Information
- Name: [Customer Name]
- Email: [Email Address]
- Organization: [Organization/Tenant Name]
- User Role: [Admin/Agent Manager/Client]
- Tenant ID: [ID if known]

## Issue Details
- Category: [Agent/KB/Integration/Billing/etc.]
- Priority: [P1/P2/P3/P4]
- Reported: [Date/Time]
- SLA Deadline: [Date/Time]

### Description
[Customer's description of the issue]

### Expected Behavior
[What should happen]

### Actual Behavior
[What actually happens]

### Reproduction Steps
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Technical Information
- Agent ID: [If applicable]
- Knowledge Base ID: [If applicable]
- Browser: [Browser and version]
- OS: [Operating System]
- Error Messages: [Any errors]

## Troubleshooting Log

### [Date/Time] - Initial Investigation
- Checked: [What was checked]
- Found: [Findings]
- Action: [Action taken]

### [Date/Time] - [Next Step]
- [Details]

## Resolution

### Root Cause
[What was wrong]

### Solution
[What fixed it]

### Steps Taken
1. [Step 1]
2. [Step 2]
3. [Step 3]

### Verification
[How we confirmed it works]

### Prevention
[How to avoid in future]

## Customer Communication Log

### [Date/Time] - Initial Response
[Message sent]

### [Date/Time] - Update
[Message sent]

### [Date/Time] - Resolution Notification
[Message sent]

## Closure
- Resolved: [Date/Time]
- Time to Resolution: [Duration]
- SLA Met: [Yes/No]
- Customer Satisfied: [Yes/No/Pending]
- Added to KB: [Yes/No]
```

---

## Tips for Support Success

### Do's ✅
- Read error messages carefully
- Check recent changes first
- Test in incognito mode
- Document everything
- Ask clarifying questions
- Provide workarounds when possible
- Follow up until confirmed resolved
- Learn from each ticket

### Don'ts ❌
- Assume without verifying
- Skip diagnostic steps
- Make changes without backup
- Give vague responses
- Miss SLA deadlines without notice
- Close tickets without confirmation
- Forget to document resolution
- Take customer frustration personally

---

**Last Updated:** November 2024  
**Version:** 1.0  
**Review and update procedures quarterly**
