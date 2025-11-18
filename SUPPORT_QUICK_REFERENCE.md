# AIVA Support - Quick Reference Card

> **Print this page and keep it handy for instant access to common fixes!**

---

## 🚨 Top 10 Most Common Issues & Instant Fixes

### 1. Agent Not Responding ⚠️
**Check:** Credits → Agent Status → API Key
```bash
✓ Credits > 0
✓ Agent Status = Active
✓ Test with Test Chat/Test Call
```

### 2. Knowledge Base Not Working 📚
**Fix:** Clear semantic cache
```
Knowledge Base → [KB Name] → Settings → Clear Cache
Then: Test search manually
```

### 3. Chat Widget Not Showing 💬
**Check:** 
```javascript
✓ Agent → Chat Integration → Enabled
✓ Embed code installed before </body>
✓ Agent ID correct in embed code
✓ Test in incognito mode
```

### 4. Shopify Sync Failed 🛍️
**Fix:**
```
Shopify → [Store] → Test Connection
If fails: Regenerate API token in Shopify
Then: Trigger Manual Sync
```

### 5. Poor Voice Quality 🎙️
**Quick Fix:**
```
✓ Speed = 1.0 (not 1.5 or 0.5)
✓ Voice = Shimmer or Alloy
✓ Check user's internet speed
✓ Test from different location
```

### 6. User Can't Login 🔐
**Reset Process:**
```
Users → [User] → Reset Password
OR
Users → [User] → Status = Active
```

### 7. Documents Won't Upload 📄
**Check:**
```
✓ File < 50MB
✓ Format supported (PDF, DOCX, XLSX, etc.)
✓ Not password-protected
✓ Python service running: curl localhost:8000/health
```

### 8. Wrong Answers from Agent 🤖
**Fix:**
```
1. Agent → Settings → Enable Knowledge Base Search
2. Add to instructions: "Always search knowledge base first"
3. Test: KB → Search → Enter same question
```

### 9. Credits Running Out Fast 💰
**Optimize:**
```
✓ Enable Semantic Cache (saves 50-80%)
✓ Lower Max Tokens to 1024
✓ Use GPT-3.5 instead of GPT-4
✓ Reduce KB top_k from 10 to 5
```

### 10. Slow Responses ⏱️
**Speed Up:**
```
Agent Settings:
- Max Tokens: 1024 (not 4096)
- Top K: 5 (not 10)
- Temperature: 0.7
Add to instructions: "Be extremely concise"
```

---

## 📞 Emergency Contacts

| Issue Type | Contact | Response Time |
|------------|---------|---------------|
| Critical System Down | support@contegris.com | < 1 hour |
| Billing Issues | billing@contegris.com | < 24 hours |
| General Support | support@contegris.com | < 4 hours |

---

## 🔍 Fast Diagnostic Commands

### Check All Services
```bash
pm2 status                    # All Node.js services
systemctl status mysql        # Database
systemctl status redis        # Cache/Vector store
curl localhost:62001/api/health    # API
curl localhost:8000/health         # Python
```

### Service Restart (Most Common Fix)
```bash
pm2 restart api              # Restart API
pm2 restart python           # Restart Python service
pm2 restart bridge           # Restart Voice bridge
systemctl restart redis      # Restart Redis
```

### Check Logs
```bash
pm2 logs api --lines 50      # API logs
pm2 logs python --lines 50   # Python logs
pm2 logs bridge --lines 50   # Bridge logs
```

---

## 🗄️ Quick Database Queries

### Check Agent
```sql
SELECT id, name, status, type FROM yovo_tbl_aiva_agents 
WHERE id = 'AGENT_ID';
```

### Check Credits
```sql
SELECT name, credit_balance FROM yovo_tbl_aiva_tenants 
WHERE id = 'TENANT_ID';
```

### Check Document Status
```sql
SELECT original_filename, status, processing_stats 
FROM yovo_tbl_aiva_documents 
WHERE kb_id = 'KB_ID' 
ORDER BY created_at DESC LIMIT 5;
```

### Recent Calls
```sql
SELECT agent_id, duration_seconds, cost, status, created_at 
FROM yovo_tbl_aiva_call_logs 
ORDER BY created_at DESC LIMIT 10;
```

---

## 🔧 Configuration Quick Fixes

### Agent Not Using Knowledge Base
```
Agent → Settings → Tools:
☑ Enable Knowledge Base Search
☑ Select correct KB
☑ Top K: 5-10

Instructions (add):
"CRITICAL: Always search knowledge base before answering"
```

### Agent Talks Too Much
```
Agent → Settings:
- Max Tokens: 1024 (not 4096)

Conversation Strategy:
- Silence Threshold: 900ms
- Enable Interruptions: YES

Instructions (add):
"Keep responses to 2-3 sentences maximum"
```

### Knowledge Search Too Slow
```
KB Settings:
- Enable Semantic Cache: YES
- Search Type: Text only (not Hybrid)

Agent Settings:
- Top K: 5 (not 10)
```

---

## 🎯 Common Error Codes

| Code | Meaning | Fix |
|------|---------|-----|
| 401 | Unauthorized | Check API key / JWT token |
| 403 | Forbidden | Check user permissions |
| 404 | Not Found | Verify agent/KB ID exists |
| 429 | Rate Limit | Wait 1 minute, retry |
| 500 | Server Error | Check logs, restart service |
| 503 | Service Unavailable | Service down, restart |

---

## 📋 Troubleshooting Workflow

```
1. IDENTIFY: What's not working?
   ↓
2. VERIFY: Is service running?
   → pm2 status / systemctl status
   ↓
3. CHECK: Configuration correct?
   → Settings / Database
   ↓
4. TEST: Can you reproduce?
   → Test Call / Test Chat
   ↓
5. LOGS: What's the error?
   → pm2 logs / Database queries
   ↓
6. FIX: Apply solution
   → Restart / Configuration / Clear cache
   ↓
7. VERIFY: Did it work?
   → Test again
   ↓
8. DOCUMENT: Add to notes
```

---

## 🚀 Performance Optimization Checklist

```
☐ Semantic cache enabled
☐ Max tokens ≤ 1024
☐ Knowledge base < 1000 documents
☐ Top K between 5-10
☐ Redis memory < 80%
☐ MySQL connections < 400
☐ Server CPU < 80%
☐ Disk space > 20%
```

---

## 📊 Normal vs. Abnormal Metrics

### Response Times
- ✅ Normal: < 3 seconds
- ⚠️ Slow: 3-5 seconds
- 🚨 Very Slow: > 5 seconds

### Credits Usage
- ✅ Normal: $0.02-0.10 per interaction
- ⚠️ High: $0.10-0.30 per interaction
- 🚨 Very High: > $0.30 per interaction

### Document Processing
- ✅ Normal: 30 seconds - 2 minutes
- ⚠️ Slow: 2-5 minutes
- 🚨 Stuck: > 10 minutes

---

## 🔐 Security Quick Checks

### User Account Issues
```
☐ Account active (not deactivated)
☐ Email verified
☐ Password meets requirements
☐ Not locked (check audit log)
☐ Correct tenant association
```

### API Security
```
☐ API key valid and not expired
☐ JWT token not expired
☐ CORS configured correctly
☐ Rate limiting in place
```

---

## 💾 Backup Before Making Changes

**Always backup before:**
- Deleting agents or KBs
- Changing critical settings
- Running SQL updates
- Clearing large caches

```bash
# Quick DB backup
mysqldump -u root -p yovo_db_cc > backup_$(date +%Y%m%d_%H%M%S).sql

# Backup .env files
cp /etc/aiva-oai/api/.env /etc/aiva-oai/api/.env.backup
```

---

## 🎓 Escalation Decision Tree

```
Is system completely down?
├─ YES → P1 - Escalate immediately
└─ NO
    ↓
    Are multiple users affected?
    ├─ YES → P2 - Escalate within 4 hours
    └─ NO
        ↓
        Is there a workaround?
        ├─ NO → P2 - Escalate within 4 hours
        └─ YES → P3 - Document and escalate within 24h
```

---

## 📱 Support Resources

### Documentation
- Full Troubleshooting Guide: `TROUBLESHOOTING_GUIDE.md`
- User Help Center: `/aiva/help`
- This Quick Reference: Keep printed nearby

### Tools
- Database: phpMyAdmin or MySQL Workbench
- Logs: `pm2 logs` or `journalctl`
- Monitoring: `htop` or `pm2 monit`
- API Testing: Postman or `curl`

---

## 💡 Pro Tips

1. **Always test in incognito mode** - Rules out cache issues
2. **Check credits first** - Most common cause of "not working"
3. **Read the error message** - Usually tells you exactly what's wrong
4. **Restart services** - Fixes 50% of issues instantly
5. **Clear semantic cache** - When KB search behaves oddly
6. **Check service status first** - Before diving deep into logs
7. **Document everything** - For escalation or future reference
8. **Test after every fix** - Confirm solution works

---

## 🎯 Today's Support Metrics

Track your performance:

```
Issues Resolved Today: _____
Average Resolution Time: _____ minutes
Escalations Required: _____
Customer Satisfaction: _____/5

Most Common Issue Today: _________________
Quick Win of the Day: _________________
```

---

**Last Updated:** November 2024  
**Version:** 1.0  
**Keep this card updated with new discoveries!**

---

## 📞 Remember

✅ **Stay calm** - Most issues have simple fixes  
✅ **Follow the steps** - Don't skip diagnostics  
✅ **Ask for help** - Escalate when stuck  
✅ **Document solutions** - Help the next person  

**You've got this! 💪**
