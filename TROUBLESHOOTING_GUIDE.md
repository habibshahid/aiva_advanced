# AIVA Platform - Support Team Troubleshooting Guide

## 📋 Table of Contents

1. [Quick Reference](#quick-reference)
2. [Agent Issues](#agent-issues)
3. [Knowledge Base Issues](#knowledge-base-issues)
4. [Shopify Integration Issues](#shopify-integration-issues)
5. [Chat Integration Issues](#chat-integration-issues)
6. [Voice Call Issues](#voice-call-issues)
7. [User Access Issues](#user-access-issues)
8. [Billing & Credits Issues](#billing--credits-issues)
9. [System Issues](#system-issues)
10. [Diagnostic Tools](#diagnostic-tools)
11. [Escalation Procedures](#escalation-procedures)

---

## Quick Reference

### Common Issues & Fast Fixes

| Issue | Quick Fix | Details |
|-------|-----------|---------|
| Agent not responding | Check agent is active, verify API credits | [Link](#agent-not-responding) |
| Knowledge base search not working | Clear semantic cache | [Link](#knowledge-base-not-searching) |
| Shopify sync failed | Verify API credentials, check permissions | [Link](#shopify-sync-failing) |
| Chat widget not loading | Check embed code, verify agent is enabled | [Link](#chat-widget-not-appearing) |
| Voice quality poor | Check network connection, audio settings | [Link](#poor-voice-quality) |
| User can't login | Reset password, verify account active | [Link](#user-cannot-login) |

### Emergency Contacts

- **Technical Issues:** support@contegris.com
- **Billing Issues:** billing@contegris.com
- **System Outages:** Check status.contegris.com

### System Status Checks

1. **API Health:** `GET https://your-domain.com/aiva/api/health`
2. **Python Service:** `GET https://your-domain.com/python/health`
3. **Database:** Check from admin panel

---

## Agent Issues

### Agent Not Responding

**Symptoms:**
- Agent doesn't respond to messages
- No reply in chat or voice calls
- Error messages appear

**Diagnostic Steps:**

1. **Check Agent Status**
   ```
   Location: Agents > [Agent Name] > Status
   Expected: Active (green indicator)
   ```

2. **Verify API Credits**
   ```
   Location: Credits > Credit Balance
   Expected: > 0 credits remaining
   If 0: User needs to add credits
   ```

3. **Check Agent Configuration**
   ```
   Agents > [Agent Name] > Settings
   Verify:
   - ✅ Name is set
   - ✅ Greeting message exists
   - ✅ Instructions are not empty
   - ✅ Model is selected (GPT-4 or GPT-3.5)
   ```

4. **Test Agent**
   ```
   Use Test Chat or Test Call feature
   If works in test: Check integration settings
   If fails in test: Agent configuration issue
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Agent deactivated | Go to Agents > Edit > Set Status to Active |
| No credits remaining | Credits > Add Credits |
| Invalid API key | Settings > API Keys > Regenerate |
| OpenAI API down | Check status.openai.com, wait or contact support |
| Instructions too long | Reduce instructions to under 8000 characters |
| Empty system prompt | Add instructions (minimum 50 characters) |

**Resolution Time:** 5-15 minutes

---

### Agent Gives Wrong Answers

**Symptoms:**
- Provides incorrect information
- Makes up facts (hallucination)
- Doesn't use knowledge base

**Diagnostic Steps:**

1. **Check Knowledge Base Connection**
   ```
   Agents > [Agent] > Settings > Tools
   Verify: Knowledge Base Search is enabled
   Verify: Correct KB is selected
   ```

2. **Test Knowledge Base Search**
   ```
   Knowledge Base > [KB] > Search tab
   Enter same question user asked
   Check if relevant results appear
   ```

3. **Review Agent Instructions**
   ```
   Look for:
   - Instructions telling agent NOT to search KB
   - Conflicting instructions
   - Missing instruction to admit when unsure
   ```

4. **Check Document Quality**
   ```
   Knowledge Base > Documents
   Verify documents are:
   - Processed successfully (not failed)
   - Containing correct information
   - Not duplicated or conflicting
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| KB search disabled | Enable in Agent Settings > Tools |
| Wrong KB selected | Change to correct KB in agent settings |
| Poor quality documents | Re-upload with better formatting |
| No instruction to use KB | Add: "Always search knowledge base before answering" |
| No instruction to admit unknowns | Add: "If you don't know, say so clearly" |
| Temperature too high | Lower from 1.0 to 0.7 or 0.5 |
| Semantic cache returning old results | Clear cache: KB > Settings > Clear Cache |

**Quick Fix:**
```
Add to agent instructions:
"CRITICAL: 
1. Always search the knowledge base for answers
2. If information is not in the KB, say 'I don't have that information'
3. Never make up or guess information
4. Always cite sources when available"
```

**Resolution Time:** 10-30 minutes

---

### Agent Response Too Slow

**Symptoms:**
- Long delays before response
- Timeout errors
- Users complaining about wait times

**Diagnostic Steps:**

1. **Check Response Times**
   ```
   Calls > [Recent Call] > View Details
   Look at: Processing Time
   Normal: < 3 seconds
   Slow: > 5 seconds
   Very slow: > 10 seconds
   ```

2. **Identify Bottleneck**
   ```
   Check which part is slow:
   - Knowledge base search time
   - LLM response generation time
   - Network latency
   ```

3. **Monitor System Load**
   ```
   Monitor > System Resources
   Check CPU, Memory, API rate limits
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Large knowledge base | Reduce KB size or improve indexing |
| Too many KB searches | Lower top_k from 10 to 5 |
| Max tokens too high | Reduce from 4096 to 2048 or 1024 |
| Slow network | Check connection, contact hosting provider |
| API rate limiting | Upgrade plan or space out requests |
| Complex instructions | Simplify system prompt |
| Multiple function calls | Optimize or reduce functions |

**Optimization Settings:**
```
Agent Settings:
- Max Tokens: 1024 (instead of 4096)
- Temperature: 0.7 (good balance)
- Top K (KB search): 5 (instead of 10)

Knowledge Base:
- Cache enabled: Yes
- Search type: Text only (faster than hybrid)
```

**Resolution Time:** 15-45 minutes

---

### Agent Won't Stop Talking (Voice)

**Symptoms:**
- Agent keeps speaking
- Doesn't wait for user
- Interrupts user frequently

**Diagnostic Steps:**

1. **Check Conversation Strategy Settings**
   ```
   Agents > [Agent] > Conversation Strategy
   Review:
   - Turn Detection Mode
   - Silence Threshold
   - Interruption settings
   ```

2. **Review Response Length**
   ```
   Agents > [Agent] > Settings
   Check: Max Tokens
   High value (>2048) = longer responses
   ```

3. **Test in Different Environments**
   ```
   Test in:
   - Quiet room (to rule out false voice detection)
   - Different phone/device
   - Different network
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Silence threshold too short | Increase from 500ms to 900ms |
| Max tokens too high | Reduce to 1024 or lower |
| Instructions encourage long answers | Add: "Keep responses to 2-3 sentences" |
| Interruption disabled | Enable interruption in Conversation Strategy |
| False voice detection | Increase Speech Threshold |
| Agent instructions too detailed | Simplify, focus on concise answers |

**Quick Fix:**
```
1. Go to Conversation Strategy
2. Set Silence Threshold: 900ms
3. Enable Interruptions: Yes
4. Set Interruption Sensitivity: Medium

5. Add to agent instructions:
"Keep all responses under 3 sentences. Be extremely concise."
```

**Resolution Time:** 10-20 minutes

---

## Knowledge Base Issues

### Knowledge Base Not Searching

**Symptoms:**
- Agent says "I don't have that information" when it should
- Search returns no results
- Agent doesn't use uploaded documents

**Diagnostic Steps:**

1. **Verify Documents Processed**
   ```
   Knowledge Base > Documents
   Check status column:
   - ✅ Completed (green) = OK
   - 🔄 Processing (yellow) = Wait
   - ❌ Failed (red) = Problem
   ```

2. **Test Search Manually**
   ```
   Knowledge Base > Search tab
   Enter: Question that should be in documents
   Expected: Relevant chunks appear
   If no results: Documents not properly indexed
   ```

3. **Check Vector Storage**
   ```
   Knowledge Base > Stats
   Verify:
   - Total Chunks > 0
   - Total Documents > 0
   - Embeddings Generated > 0
   ```

4. **Verify Agent KB Connection**
   ```
   Agents > [Agent] > Settings > Tools
   Verify:
   - KB Search enabled: YES
   - Correct KB selected
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Documents still processing | Wait for processing to complete (check status) |
| Documents failed to process | Re-upload documents |
| KB not connected to agent | Connect KB in agent settings |
| Search service down | Check Python service health endpoint |
| Redis connection failed | Restart Redis service |
| Embeddings not generated | Delete and re-upload documents |
| Wrong KB selected | Update agent to use correct KB |
| Semantic cache stale | Clear cache: KB > Settings > Clear Cache |

**Quick Diagnostic:**
```sql
-- Check if chunks exist in database
SELECT COUNT(*) FROM yovo_tbl_aiva_chunks WHERE kb_id = '[KB_ID]';

-- Check if embeddings exist
SELECT COUNT(*) FROM yovo_tbl_aiva_chunks 
WHERE kb_id = '[KB_ID]' AND vector_id IS NOT NULL;
```

**Resolution Time:** 10-30 minutes (excluding re-processing time)

---

### Document Upload Failing

**Symptoms:**
- Upload button doesn't work
- Files get stuck in "Processing"
- "Upload failed" error

**Diagnostic Steps:**

1. **Check File Requirements**
   ```
   Verify:
   - File size < 50MB
   - Supported format: PDF, DOCX, PPTX, XLSX, TXT, HTML, MD, JSON
   - File not corrupted
   - File not password-protected
   ```

2. **Check Browser Console**
   ```
   F12 > Console tab
   Look for error messages
   Common: Network error, CORS error, 413 (file too large)
   ```

3. **Verify Storage Space**
   ```
   Check server disk space
   Path: /etc/aiva-oai/storage/documents/
   ```

4. **Check Python Service**
   ```
   Test: curl http://localhost:8000/health
   Expected: {"status": "healthy"}
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| File too large (>50MB) | Split into smaller files or compress |
| Unsupported format | Convert to supported format |
| Corrupted file | Try re-downloading/re-saving file |
| Password protected | Remove password protection |
| No disk space | Clear old files or expand storage |
| Python service down | Restart: `systemctl restart aiva-python` |
| Network timeout | Upload during off-peak hours |
| Browser cache issue | Clear cache, try different browser |

**Quick Fix for Stuck Processing:**
```sql
-- Mark as failed so user can retry
UPDATE yovo_tbl_aiva_documents 
SET status = 'failed' 
WHERE id = '[DOCUMENT_ID]' AND status = 'processing';
```

**Resolution Time:** 5-15 minutes

---

### Web Scraping Not Working

**Symptoms:**
- URL scraping fails
- No content imported
- Error: "Failed to fetch URL"

**Diagnostic Steps:**

1. **Test URL Accessibility**
   ```
   Documents > Scrape > Test URL
   Enter: Website URL
   Check if preview appears
   ```

2. **Check URL Format**
   ```
   Valid: https://example.com
   Valid: http://example.com
   Invalid: example.com (missing protocol)
   Invalid: www.example.com (missing protocol)
   ```

3. **Verify Network Access**
   ```
   From server, test:
   curl -I https://target-website.com
   
   Check for:
   - Status 200 OK
   - No firewall blocking
   - No robots.txt preventing scraping
   ```

4. **Check Scraping Settings**
   ```
   Verify:
   - Max pages not set too low
   - Depth appropriate (2-3 recommended)
   - URL filters not blocking everything
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| URL requires authentication | Cannot scrape password-protected sites |
| robots.txt blocks scraping | Check with site owner for permission |
| Site blocks bot requests | Cannot bypass; ask for API access |
| Invalid URL format | Add https:// prefix |
| Network firewall | Whitelist target domain in firewall |
| Site uses JavaScript heavily | May not capture dynamic content |
| Rate limiting | Reduce max_pages, increase delay |
| SSL certificate error | Update system certificates |

**Scraping Best Practices:**
```
✅ DO:
- Scrape your own websites
- Respect robots.txt
- Use reasonable max_pages (< 100)
- Set appropriate depth (2-3)

❌ DON'T:
- Scrape competitors' sites without permission
- Set max_pages too high (> 500)
- Scrape sensitive/private content
- Ignore rate limits
```

**Resolution Time:** 10-30 minutes

---

### Images Not Displaying

**Symptoms:**
- Images missing in chat responses
- Broken image icons
- Image search returns no results

**Diagnostic Steps:**

1. **Verify Image Processing**
   ```
   Knowledge Base > Documents > [Document]
   Check: Extracted Images count
   Should be > 0 for PDFs with images
   ```

2. **Check Image Storage**
   ```
   Server path: /etc/aiva-oai/storage/images/[KB_ID]/
   Verify files exist and are readable
   ```

3. **Test Image URL**
   ```
   Get image URL from database or API response
   Try accessing: https://your-domain.com/api/images/[KB_ID]/[filename]
   Should return image, not 404
   ```

4. **Check Image Service**
   ```
   API Routes: /api/images/:kbId/:imageFilename
   Verify route is registered in Express
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Images not extracted | Re-upload PDF documents |
| Wrong file permissions | chmod 644 /storage/images/*/*.* |
| Image service not running | Restart API service |
| CORS blocking images | Add image domain to CORS whitelist |
| Broken image links | Regenerate image references |
| Missing authentication | Verify API key or JWT token |
| Storage path incorrect | Check STORAGE_PATH env variable |

**Quick Fix:**
```bash
# Fix permissions
sudo chown -R www-data:www-data /etc/aiva-oai/storage/images/
sudo chmod -R 755 /etc/aiva-oai/storage/images/

# Verify images exist
ls -lh /etc/aiva-oai/storage/images/[KB_ID]/
```

**Resolution Time:** 10-20 minutes

---

## Shopify Integration Issues

### Shopify Sync Failing

**Symptoms:**
- Sync job shows "Failed" status
- Products not appearing
- Sync gets stuck

**Diagnostic Steps:**

1. **Check Sync Job Details**
   ```
   Shopify > Stores > [Store] > Sync Jobs
   Click failed job to see error message
   ```

2. **Verify Shopify Credentials**
   ```
   Shopify > Stores > [Store] > Settings
   Click "Test Connection"
   Expected: "Connection successful"
   ```

3. **Check Shopify API Access**
   ```
   From Shopify admin:
   Settings > Apps > [AIVA App] > Configuration
   Verify scopes: read_products, read_inventory
   ```

4. **Check API Rate Limits**
   ```
   Shopify has rate limits:
   - 2 requests/second
   - 40 requests burst
   If exceeded: Wait and retry
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Invalid access token | Regenerate token in Shopify, update in AIVA |
| Insufficient permissions | Add required scopes in Shopify app |
| Store domain incorrect | Verify format: store.myshopify.com |
| API rate limit hit | Wait 5 minutes, retry sync |
| Network timeout | Retry with smaller batch size |
| KB not selected | Select knowledge base in store settings |
| Shopify app uninstalled | Reinstall custom app in Shopify |
| Products have no inventory | Enable sync of all products, not just in-stock |

**Manual Credential Test:**
```bash
# Test Shopify API access
curl -X GET \
  "https://[STORE].myshopify.com/admin/api/2024-01/products.json?limit=1" \
  -H "X-Shopify-Access-Token: [YOUR_TOKEN]"

# Expected: JSON with products
# Error 401: Invalid token
# Error 403: Insufficient permissions
```

**Resolution Time:** 15-30 minutes

---

### Products Not Showing in Search

**Symptoms:**
- Agent doesn't recommend products
- Product search returns empty
- Products synced but not searchable

**Diagnostic Steps:**

1. **Verify Sync Completed**
   ```
   Shopify > Stores > [Store] > Products
   Check: Total products count > 0
   Check: Last sync status: Completed
   ```

2. **Check KB Association**
   ```
   Shopify > Stores > [Store] > Settings
   Verify: Knowledge Base selected
   Verify: Products visible in KB
   ```

3. **Test Product Search**
   ```
   Knowledge Base > [Shopify KB] > Search
   Search for: Product name
   Expected: Product chunks appear
   ```

4. **Verify Agent Configuration**
   ```
   Agents > [Agent] > Settings > Tools
   Verify:
   - Knowledge Base Search: Enabled
   - Correct Shopify KB selected
   - Product Search: Enabled
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Products not embedded | Re-run sync, verify embeddings generated |
| Wrong KB in agent | Update agent to use Shopify KB |
| Product status filter | Change filter to include all product statuses |
| Products archived in Shopify | Re-activate products or change sync filter |
| Vector index not updated | Clear KB cache and rebuild |
| Agent instructions don't mention products | Add product search guidance to instructions |

**Quick Fix:**
```
1. Shopify > Stores > [Store] > Trigger Manual Sync
2. Wait for completion (5-30 min depending on product count)
3. Clear KB cache: Knowledge Base > [KB] > Clear Cache
4. Test search manually
```

**Resolution Time:** 20-45 minutes (including sync time)

---

### Product Prices Incorrect

**Symptoms:**
- Agent shows wrong prices
- Out of date pricing
- Missing sale prices

**Diagnostic Steps:**

1. **Check Last Sync Time**
   ```
   Shopify > Stores > [Store] > Last Synced
   If > 24 hours old: Prices may be outdated
   ```

2. **Verify Sync Frequency**
   ```
   Shopify > Stores > [Store] > Settings
   Check: Auto-sync enabled
   Check: Sync frequency (recommended: Daily)
   ```

3. **Compare with Shopify**
   ```
   Get product ID from AIVA
   Check same product in Shopify admin
   Compare: Price, Compare-at price, Variants
   ```

4. **Check Variant Selection**
   ```
   Shopify products with variants have multiple prices
   Agent may be showing different variant price
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Auto-sync disabled | Enable in store settings |
| Sync frequency too low | Increase from Weekly to Daily |
| Prices changed in Shopify recently | Trigger manual sync |
| Agent showing variant price | Specify which variant in agent instructions |
| Currency conversion issue | Check currency settings |
| Sale price not synced | Verify compare_at_price field syncing |

**Quick Fix:**
```
1. Enable auto-sync
2. Set frequency to Daily (1440 minutes)
3. Trigger immediate manual sync
4. Clear semantic cache after sync completes
```

**Resolution Time:** 5-15 minutes + sync time

---

## Chat Integration Issues

### Chat Widget Not Appearing

**Symptoms:**
- Widget doesn't show on website
- No chat button visible
- JavaScript errors

**Diagnostic Steps:**

1. **Verify Widget Enabled**
   ```
   Agents > [Agent] > Chat Integration
   Check: Chat Widget Integration enabled
   Check: Agent is active
   ```

2. **Check Embed Code**
   ```
   Get embed code from Chat Integration page
   Verify it's installed on website:
   - In <body> tag (before </body>)
   - Complete code (not truncated)
   - Agent ID matches
   ```

3. **Browser Console Check**
   ```
   F12 > Console
   Look for:
   - Loading errors
   - CORS errors  
   - 404 errors for widget.js
   - Agent ID errors
   ```

4. **Test in Incognito**
   ```
   Open website in incognito/private mode
   Widget should appear (rules out cache issues)
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Chat integration disabled | Enable in Agent > Chat Integration |
| Agent not active | Activate agent |
| Embed code not installed | Install code before </body> tag |
| Incorrect agent ID | Copy fresh embed code |
| Browser cache | Clear cache or test in incognito |
| CORS blocking widget.js | Add domain to CORS whitelist |
| widget.js URL wrong | Verify WIDGET_URL in env variables |
| Ad blocker | Whitelist your domain |
| CSP policy blocking | Add widget domain to CSP |

**Testing Checklist:**
```
✅ Agent active
✅ Chat integration enabled  
✅ Embed code installed correctly
✅ Tested in incognito mode
✅ Console shows no errors
✅ widget.js loads (check Network tab)
✅ API endpoint accessible
```

**Quick Fix:**
```html
<!-- Verify this exact structure -->
<script>
  (function(w,d,s,o,f,js,fjs){
    w['AIVAWidget']=o;w[o] = w[o] || function () { 
      (w[o].q = w[o].q || []).push(arguments) 
    };
    js = d.createElement(s), fjs = d.getElementsByTagName(s)[0];
    js.id = o; js.src = f; js.async = 1; 
    fjs.parentNode.insertBefore(js, fjs);
  }(window, document, 'script', 'aiva', 'https://your-domain.com/aiva/widget.js'));
  
  aiva('init', {
    agentId: 'YOUR_AGENT_ID', // CRITICAL: Verify this ID
    primaryColor: '#6366f1',
    position: 'bottom-right'
  });
</script>
```

**Resolution Time:** 10-30 minutes

---

### Chat Not Responding

**Symptoms:**
- User sends message but no response
- "Typing..." indicator stuck
- Timeout errors

**Diagnostic Steps:**

1. **Check Agent Status**
   ```
   Same as "Agent Not Responding" section
   Verify: Agent active, credits available
   ```

2. **Check Network Requests**
   ```
   F12 > Network tab
   Send test message
   Look for:
   - POST to /api/chat/message
   - Status 200 (success) or error code
   - Response time
   ```

3. **Review Chat Session**
   ```
   Dashboard > Chat Sessions (if available)
   Or check database:
   yovo_tbl_aiva_chat_sessions
   ```

4. **Test API Directly**
   ```
   Use Postman or curl:
   POST /api/chat/message
   {
     "session_id": "test",
     "agent_id": "[AGENT_ID]",
     "message": "Hello"
   }
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Agent inactive | Activate agent |
| No API credits | Add credits |
| API key invalid | Regenerate API key |
| Network timeout | Check server load |
| Session expired | Start new session |
| CORS error | Update CORS settings |
| Agent configuration error | Review agent settings |
| Database connection lost | Restart database |
| Chat service down | Restart API service |

**Error Code Reference:**
- **401 Unauthorized:** API key missing or invalid
- **403 Forbidden:** Agent doesn't belong to user's tenant
- **404 Not Found:** Agent ID doesn't exist
- **429 Too Many Requests:** Rate limit exceeded
- **500 Server Error:** Internal server issue
- **504 Gateway Timeout:** Request took too long

**Resolution Time:** 10-25 minutes

---

### Chat Sessions Not Saving

**Symptoms:**
- Conversation history lost on refresh
- Previous messages don't show
- Session ID not persistent

**Diagnostic Steps:**

1. **Check Session Creation**
   ```
   Database: yovo_tbl_aiva_chat_sessions
   Verify sessions are being created
   ```

2. **Check Browser Storage**
   ```
   F12 > Application > Local Storage
   Look for: session_id key
   Should persist across page loads
   ```

3. **Review Session Logic**
   ```
   Check widget.js or chat page code
   Verify: Session ID stored in localStorage
   Verify: Session ID sent with each message
   ```

4. **Test Session Retrieval**
   ```
   API: GET /api/chat/history?session_id=[ID]
   Should return: Previous messages
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| localStorage disabled | Enable in browser settings |
| Session timeout too short | Increase session expiry time |
| Cookie/storage cleared | Document behavior for users |
| Browser privacy mode | Sessions won't persist in incognito |
| Database not saving | Check database connection |
| Session ID not generated | Fix session creation logic |
| CORS blocking cookies | Update CORS credentials setting |

**Resolution Time:** 15-30 minutes

---

## Voice Call Issues

### Poor Voice Quality

**Symptoms:**
- Robotic or distorted voice
- Echo or feedback
- Choppy audio
- User hard to understand

**Diagnostic Steps:**

1. **Check Network Connection**
   ```
   Test: Internet speed test
   Required: > 1 Mbps upload/download
   Check: Latency < 100ms
   ```

2. **Verify Audio Settings**
   ```
   Agents > [Agent] > Voice Settings
   Check: Voice selection
   Check: Speed (should be 1.0)
   ```

3. **Test Different Device**
   ```
   Try call from:
   - Different phone
   - Different location
   - Different network
   Helps isolate if issue is device/network specific
   ```

4. **Review Call Logs**
   ```
   Calls > [Call Details]
   Check: Audio quality metrics (if available)
   Check: Packet loss indicators
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Poor network connection | Use wired connection or better WiFi |
| Voice speed too fast/slow | Reset to 1.0 (normal speed) |
| Wrong codec | Verify using μ-law or G.711 |
| Server overload | Check CPU/memory usage |
| Jitter/packet loss | Improve network quality |
| Echo | Enable echo cancellation |
| Low bandwidth | Reduce concurrent calls |
| Firewall blocking RTP | Open RTP ports (10000-20000) |
| Wrong sample rate | Use 8000 Hz or 16000 Hz |

**Network Requirements:**
```
Minimum per concurrent call:
- Upload: 100 Kbps
- Download: 100 Kbps
- Latency: < 150ms
- Packet loss: < 1%

Firewall Rules:
- SIP: Port 5060 UDP
- RTP: Ports 10000-20000 UDP
```

**Resolution Time:** 10-40 minutes

---

### Voice Agent Not Answering Calls

**Symptoms:**
- Calls not connecting
- Busy signal
- No response when calling

**Diagnostic Steps:**

1. **Check Asterisk Status**
   ```
   SSH to server:
   asterisk -rx "core show calls"
   Should show: Active calls if any
   
   asterisk -rx "pjsip show endpoints"
   Should show: Registered endpoints
   ```

2. **Verify Bridge Service**
   ```
   Check: Bridge service running
   pm2 status
   Should see: bridge process (online)
   ```

3. **Check Agent Configuration**
   ```
   Agents > [Agent]
   Verify:
   - Type: Voice (not Chat)
   - Status: Active
   - Phone number configured (if applicable)
   ```

4. **Review Bridge Logs**
   ```
   Path: /etc/aiva-oai/bridge/logs/
   Look for: Connection errors, API errors
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Asterisk not running | systemctl start asterisk |
| Bridge service down | pm2 restart bridge |
| Wrong agent type (Chat instead of Voice) | Create new Voice agent |
| No phone number configured | Configure inbound routing |
| OpenAI API error | Check API status, verify key |
| Network/firewall issue | Check firewall rules |
| SIP trunk down | Verify SIP provider status |
| Extension not registered | Check Asterisk configuration |

**Quick Diagnostic Commands:**
```bash
# Check Asterisk
systemctl status asterisk

# Check Bridge
pm2 status bridge
pm2 logs bridge --lines 50

# Check OpenAI connectivity
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer YOUR_KEY"
```

**Resolution Time:** 15-45 minutes

---

### Call Drops or Disconnects

**Symptoms:**
- Calls end unexpectedly
- Frequent disconnections
- "Call failed" errors

**Diagnostic Steps:**

1. **Check Call Duration**
   ```
   Calls > [Call Details]
   Note: When call dropped
   Pattern: All calls, or specific duration?
   ```

2. **Review Session Timeout Settings**
   ```
   Bridge configuration
   Check: Session timeout (should be > 300 seconds)
   Check: Inactivity timeout
   ```

3. **Network Stability Test**
   ```
   Ping test during call
   ping -c 100 your-server.com
   Look for: Packet loss or high latency
   ```

4. **Check Server Resources**
   ```
   SSH to server:
   htop
   Check: CPU not at 100%
   Check: Memory available
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Network instability | Improve network connection |
| Session timeout too short | Increase timeout in bridge config |
| Server resource exhaustion | Upgrade server or reduce load |
| Asterisk crash | Restart Asterisk, check logs |
| Bridge crash | Restart bridge service |
| OpenAI API timeout | Retry with timeout handling |
| SIP trunk issues | Contact SIP provider |
| NAT traversal problems | Configure NAT properly |

**Timeout Configuration:**
```javascript
// In bridge config
sessionConfig: {
  timeout: 600,        // 10 minutes
  inactivityTimeout: 120,  // 2 minutes of silence
  maxCallDuration: 1800    // 30 minutes max
}
```

**Resolution Time:** 20-60 minutes

---

## User Access Issues

### User Cannot Login

**Symptoms:**
- "Invalid credentials" error
- Account locked
- Page doesn't respond to login

**Diagnostic Steps:**

1. **Verify User Exists**
   ```
   Users > Search for user email
   Check: User account exists
   Check: Status is Active
   ```

2. **Check Account Status**
   ```
   Database:
   SELECT email, is_active FROM yovo_tbl_aiva_users 
   WHERE email = '[USER_EMAIL]';
   
   is_active should be: 1
   ```

3. **Test Password Reset**
   ```
   Send password reset email
   User should receive email
   Link should work
   ```

4. **Check Login Logs**
   ```
   yovo_tbl_aiva_user_audit_log
   Look for: Failed login attempts
   Check: IP address, timestamp
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong password | Use "Reset Password" feature |
| Account deactivated | Users > Edit User > Set Active |
| Account doesn't exist | Create new user account |
| Email typo | Verify correct email |
| Browser cache | Clear cache, try incognito |
| Cookies disabled | Enable cookies |
| Account locked (security) | Admin must unlock |
| JWT expired | Login again to get new token |
| Database connection issue | Check database status |

**Password Reset Process:**
```
1. User clicks "Forgot Password"
2. Enters email address
3. System sends reset link (valid 1 hour)
4. User clicks link, sets new password
5. Password must meet requirements:
   - Minimum 8 characters
   - At least 1 uppercase
   - At least 1 number
```

**Manual Password Reset (Admin):**
```sql
-- Generate new bcrypt hash for "NewPassword123"
-- Use online bcrypt generator or Node.js

UPDATE yovo_tbl_aiva_users 
SET password_hash = '[NEW_BCRYPT_HASH]'
WHERE email = '[USER_EMAIL]';
```

**Resolution Time:** 5-15 minutes

---

### User Has Wrong Permissions

**Symptoms:**
- Cannot access certain features
- "Access denied" errors
- Missing menu items

**Diagnostic Steps:**

1. **Check User Role**
   ```
   Users > [User] > Role
   Verify: Role matches intended access level
   Roles: super_admin, admin, agent_manager, client
   ```

2. **Review Role Permissions**
   ```
   See: Help > User Roles & Permissions
   Compare: What user has vs what they need
   ```

3. **Check Tenant Association**
   ```
   Database:
   SELECT u.email, u.role, t.name as tenant
   FROM yovo_tbl_aiva_users u
   JOIN yovo_tbl_aiva_tenants t ON u.tenant_id = t.id
   WHERE u.email = '[USER_EMAIL]';
   ```

4. **Test Feature Access**
   ```
   Login as that user (if possible)
   Try accessing the feature
   Note exact error message
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Wrong role assigned | Change role to appropriate level |
| Role recently changed | User must logout and login again |
| Feature requires higher role | Upgrade user to admin or agent_manager |
| Tenant mismatch | Verify user in correct tenant |
| Permission bug | Check permission middleware |
| JWT token stale | Force logout, login again |

**Role Capabilities Quick Reference:**

| Feature | Super Admin | Admin | Agent Manager | Client |
|---------|:-----------:|:-----:|:-------------:|:------:|
| View agents | ✅ | ✅ | ✅ | ✅ |
| Create/edit agents | ✅ | ✅ | ✅ | ❌ |
| Manage users | ✅ | ✅ | ❌ | ❌ |
| Manage credits | ✅ | ✅ | ❌ | ❌ |
| View call logs | ✅ | ✅ | ✅ | ✅ |
| Test agents | ✅ | ✅ | ✅ | ❌ |
| Shopify integration | ✅ | ✅ | ❌ | ❌ |

**Resolution Time:** 5-10 minutes

---

### User Not Receiving Emails

**Symptoms:**
- Password reset emails not arriving
- Notification emails missing
- Welcome emails not sent

**Diagnostic Steps:**

1. **Check Email Settings**
   ```
   Server: Verify SMTP configured
   Check: Email service credentials
   Test: Send test email from server
   ```

2. **Check Spam Folder**
   ```
   Ask user: Check spam/junk folder
   If found: Add to safe senders
   ```

3. **Verify Email Address**
   ```
   Users > [User]
   Check: Email address correct
   Check: No typos
   ```

4. **Check Email Logs**
   ```
   Server logs: /var/log/mail.log (if available)
   Look for: Delivery failures, bounces
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Email in spam | User adds to safe senders |
| SMTP not configured | Configure SMTP settings |
| Email address typo | Correct email address |
| Email service down | Check email provider status |
| Domain not verified | Verify sending domain (SPF, DKIM) |
| Rate limit exceeded | Wait and retry |
| Blacklisted IP | Check sender reputation |
| Email template error | Fix email template |

**SMTP Configuration Check:**
```bash
# Test SMTP from server
echo "Test email body" | mail -s "Test Subject" user@example.com

# Check mail queue
mailq

# View mail logs
tail -f /var/log/mail.log
```

**Resolution Time:** 10-30 minutes

---

## Billing & Credits Issues

### Credits Not Deducting

**Symptoms:**
- Credit balance not changing
- Usage not tracked
- Cost always shows $0

**Diagnostic Steps:**

1. **Check Credit Tracking**
   ```
   Credits > Usage History
   Verify: Entries are being created
   Check: Timestamps match activity
   ```

2. **Verify Cost Calculation**
   ```
   Review recent call/chat
   Check: Cost breakdown
   Verify: Not showing $0.00 incorrectly
   ```

3. **Check Tenant Credit Balance**
   ```
   Database:
   SELECT id, name, credit_balance 
   FROM yovo_tbl_aiva_tenants
   WHERE id = '[TENANT_ID]';
   ```

4. **Review Cost Tracking Service**
   ```
   Check: Cost tracking service running
   Logs: Look for calculation errors
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Cost tracking disabled | Enable in system settings |
| Database not updating | Check database triggers |
| Credits set to unlimited | Configure proper credit system |
| Calculation service error | Restart service, check logs |
| Free tier activated | Verify if intentional |
| Bug in cost calculation | Review and fix cost calculation code |

**Manual Credit Adjustment:**
```sql
-- Add credits to tenant
UPDATE yovo_tbl_aiva_tenants 
SET credit_balance = credit_balance + 100.00
WHERE id = '[TENANT_ID]';

-- View current balance
SELECT name, credit_balance FROM yovo_tbl_aiva_tenants 
WHERE id = '[TENANT_ID]';
```

**Resolution Time:** 15-30 minutes

---

### Credits Deducting Too Fast

**Symptoms:**
- Balance decreases rapidly
- Unexpected charges
- Higher costs than anticipated

**Diagnostic Steps:**

1. **Review Usage Patterns**
   ```
   Credits > Usage History
   Sort by: Cost (descending)
   Identify: High-cost operations
   ```

2. **Check Cost Breakdown**
   ```
   Look at:
   - Embedding costs (large documents)
   - Chat completion costs (long conversations)
   - Knowledge base search costs
   - Image processing costs
   ```

3. **Identify High-Usage Agents**
   ```
   Credits > Usage by Agent
   Find: Which agents cost most
   Review: Their configuration
   ```

4. **Check for Abuse**
   ```
   Audit logs: Unusual activity patterns
   API logs: Excessive API calls
   Chat sessions: Very long sessions
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Max tokens too high | Lower from 4096 to 1024 |
| Temperature too high | Lower to 0.7 or less |
| Too many KB searches | Reduce top_k, enable caching |
| Large documents uploaded | Use smaller, focused documents |
| Semantic cache disabled | Enable caching to reduce repeat costs |
| Long conversations | Implement conversation length limits |
| API abuse | Implement rate limiting |
| Model choice (GPT-4 expensive) | Use GPT-3.5 for simple cases |

**Cost Optimization Tips:**
```
1. Enable semantic caching (saves 50-80% on repeat queries)
2. Lower max_tokens to 1024
3. Use GPT-3.5 instead of GPT-4 where appropriate
4. Reduce KB search top_k from 10 to 5
5. Implement session timeouts (15-30 min)
6. Archive old/unused agents
7. Optimize document sizes before upload
```

**Resolution Time:** 20-45 minutes

---

### Payment Issues

**Symptoms:**
- Cannot add credits
- Payment declined
- Billing error

**Diagnostic Steps:**

1. **Check Payment Method**
   ```
   Verify:
   - Card not expired
   - Sufficient funds
   - Correct billing information
   ```

2. **Review Payment Logs**
   ```
   Database: Payment transaction history
   Look for: Error messages
   Check: Payment gateway response
   ```

3. **Test Payment Gateway**
   ```
   Try: Small test transaction
   Verify: Gateway accessible
   Check: API keys valid
   ```

4. **Contact Payment Processor**
   ```
   If all checks pass, issue may be with:
   - Bank blocking transaction
   - Payment processor maintenance
   - Fraud detection
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Card expired | Update card information |
| Insufficient funds | Try different payment method |
| Bank blocking transaction | Contact bank to authorize |
| Wrong billing address | Correct billing information |
| Payment gateway down | Wait and retry |
| Card declined | Use different card |
| Fraud detection triggered | Contact payment processor |
| Currency mismatch | Verify currency settings |

**Escalation:**
```
If payment issue persists:
1. Gather: Error messages, transaction IDs
2. Contact: billing@contegris.com
3. Provide: User details, payment method type
4. Include: Screenshots of error
```

**Resolution Time:** 10-30 minutes (+ bank/payment processor time)

---

## System Issues

### API Not Responding

**Symptoms:**
- Dashboard won't load
- "Cannot connect to server" errors
- All features unavailable

**Diagnostic Steps:**

1. **Check API Service**
   ```bash
   # SSH to server
   systemctl status aiva-api
   # or
   pm2 status api
   
   Expected: running (active)
   ```

2. **Test API Health Endpoint**
   ```bash
   curl http://localhost:62001/api/health
   
   Expected: {"status":"healthy","version":"1.0.2"}
   If fails: API is down
   ```

3. **Check Server Resources**
   ```bash
   htop
   df -h
   
   Check: CPU < 90%, RAM available, Disk space > 10%
   ```

4. **Review API Logs**
   ```bash
   pm2 logs api --lines 100
   # or
   journalctl -u aiva-api -n 100
   
   Look for: Error messages, crashes
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| API service crashed | pm2 restart api or systemctl restart aiva-api |
| Out of memory | Restart service, upgrade server RAM |
| Database connection lost | Restart database: systemctl restart mysql |
| Port conflict | Check port 62001 not used by another service |
| Node.js crashed | Clear cache, restart service |
| Network issue | Check firewall, network configuration |
| Configuration error | Review .env file, check syntax |
| SSL certificate expired | Renew SSL certificate |

**Quick Recovery:**
```bash
# Stop all services
pm2 stop all

# Start in order
systemctl restart mysql
systemctl restart redis
pm2 start aiva-api
pm2 start bridge

# Verify
pm2 status
curl http://localhost:62001/api/health
```

**Resolution Time:** 10-30 minutes

---

### Database Connection Issues

**Symptoms:**
- "Database connection failed" errors
- Cannot save changes
- Data not loading

**Diagnostic Steps:**

1. **Check MySQL Status**
   ```bash
   systemctl status mysql
   # or
   systemctl status mariadb
   
   Expected: active (running)
   ```

2. **Test Database Connection**
   ```bash
   mysql -u root -p
   USE yovo_db_cc;
   SHOW TABLES;
   
   Should: Connect successfully and show tables
   ```

3. **Verify Credentials**
   ```bash
   # Check .env file
   cat /etc/aiva-oai/api/.env | grep DB_
   
   Verify: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
   ```

4. **Check Connection Pool**
   ```sql
   SHOW PROCESSLIST;
   SHOW STATUS LIKE 'Threads_connected';
   SHOW VARIABLES LIKE 'max_connections';
   
   Connections should be < max_connections
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| MySQL not running | systemctl start mysql |
| Wrong credentials | Update .env with correct credentials |
| Max connections reached | Kill idle connections, increase max_connections |
| Database locked | Restart MySQL |
| Disk full | Clear logs, expand disk |
| Corrupted tables | Run mysqlcheck --repair |
| Network issue (remote DB) | Check network connectivity |
| Firewall blocking | Allow MySQL port (3306) |

**Quick Fixes:**
```bash
# Restart MySQL
systemctl restart mysql

# Kill idle connections
mysql -u root -p -e "SHOW PROCESSLIST;" | grep Sleep | awk '{print "KILL "$1";" }' | mysql -u root -p

# Increase max connections (temporary)
mysql -u root -p -e "SET GLOBAL max_connections = 500;"

# Check table integrity
mysqlcheck -u root -p --all-databases
```

**Resolution Time:** 15-45 minutes

---

### Redis Connection Issues

**Symptoms:**
- Knowledge base search failing
- "Redis connection error"
- Slow performance

**Diagnostic Steps:**

1. **Check Redis Status**
   ```bash
   systemctl status redis
   # or
   redis-cli ping
   
   Expected: PONG
   ```

2. **Test Redis Connection**
   ```bash
   redis-cli
   127.0.0.1:6379> INFO
   
   Should: Show Redis server info
   ```

3. **Check Redis Memory**
   ```bash
   redis-cli INFO memory | grep used_memory_human
   redis-cli INFO memory | grep maxmemory
   
   Used memory should be < maxmemory
   ```

4. **Verify Vector Storage**
   ```bash
   redis-cli
   127.0.0.1:6379> KEYS kb:*
   
   Should: Show knowledge base keys
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Redis not running | systemctl start redis |
| Out of memory | Increase maxmemory or clear old data |
| Connection limit reached | Increase maxclients setting |
| Redis crashed | Restart: systemctl restart redis |
| Network issue | Check Redis bind address |
| Wrong host/port | Update .env with correct Redis connection |
| Persistent storage full | Clear old RDB/AOF files |
| Permission issue | chown redis:redis /var/lib/redis |

**Memory Management:**
```bash
# Check memory usage
redis-cli INFO memory

# Clear all data (CAUTION: This deletes everything!)
redis-cli FLUSHALL

# Clear specific KB
redis-cli DEL "kb:[KB_ID]:*"

# Increase memory limit
redis-cli CONFIG SET maxmemory 2gb
```

**Resolution Time:** 10-30 minutes

---

### Python Service Not Running

**Symptoms:**
- Document upload fails
- Knowledge search not working
- "Python service unavailable"

**Diagnostic Steps:**

1. **Check Service Status**
   ```bash
   systemctl status aiva-python
   # or
   pm2 status python
   
   Expected: active (running)
   ```

2. **Test Health Endpoint**
   ```bash
   curl http://localhost:8000/health
   
   Expected: {"status":"healthy","whoami":"aiva-python"}
   ```

3. **Check Python Logs**
   ```bash
   journalctl -u aiva-python -n 100
   # or
   pm2 logs python --lines 100
   
   Look for: Import errors, crashes, exceptions
   ```

4. **Verify Dependencies**
   ```bash
   cd /etc/aiva-oai/python-service
   source venv/bin/activate
   pip list
   
   Check: All required packages installed
   ```

**Common Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Service crashed | systemctl restart aiva-python |
| Missing dependencies | pip install -r requirements.txt |
| Python version wrong | Use Python 3.9+ |
| Import error | Install missing package |
| Port conflict | Change port or kill conflicting process |
| Memory issue | Restart service, increase memory |
| Virtual env not activated | Activate venv before running |
| Permission issue | Check file permissions |

**Quick Recovery:**
```bash
# Stop service
systemctl stop aiva-python

# Reinstall dependencies
cd /etc/aiva-oai/python-service
source venv/bin/activate
pip install --upgrade -r requirements.txt

# Start service
systemctl start aiva-python

# Verify
curl http://localhost:8000/health
```

**Resolution Time:** 15-40 minutes

---

## Diagnostic Tools

### Log Locations

```bash
# Node.js API Logs
pm2 logs api
# or
/var/log/aiva/api.log

# Python Service Logs
pm2 logs python
# or
/var/log/aiva/python.log

# Bridge Logs
pm2 logs bridge
# or
/etc/aiva-oai/bridge/logs/

# Asterisk Logs
/var/log/asterisk/full
/var/log/asterisk/messages

# MySQL Logs
/var/log/mysql/error.log

# Redis Logs
/var/log/redis/redis-server.log

# Nginx Logs (if used)
/var/log/nginx/error.log
/var/log/nginx/access.log
```

### Database Queries

```sql
-- Check agent status
SELECT id, name, type, status, created_at 
FROM yovo_tbl_aiva_agents 
WHERE tenant_id = '[TENANT_ID]';

-- Check document processing status
SELECT d.id, d.original_filename, d.status, d.file_size_bytes,
       d.created_at, d.processing_stats
FROM yovo_tbl_aiva_documents d
WHERE d.kb_id = '[KB_ID]'
ORDER BY d.created_at DESC
LIMIT 10;

-- Check recent calls
SELECT id, agent_id, duration_seconds, cost, status, created_at
FROM yovo_tbl_aiva_call_logs
ORDER BY created_at DESC
LIMIT 10;

-- Check credit usage
SELECT SUM(cost) as total_cost, COUNT(*) as operations
FROM yovo_tbl_aiva_call_logs
WHERE tenant_id = '[TENANT_ID]'
  AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY);

-- Check user sessions
SELECT id, user_id, expires_at, created_at
FROM yovo_tbl_aiva_user_sessions
WHERE user_id = '[USER_ID]'
ORDER BY created_at DESC;

-- Check Shopify sync jobs
SELECT id, store_id, status, total_products, processed_products,
       started_at, completed_at, error_message
FROM yovo_tbl_aiva_sync_jobs
WHERE store_id = '[STORE_ID]'
ORDER BY created_at DESC
LIMIT 5;
```

### API Testing

```bash
# Test API health
curl http://localhost:62001/api/health

# Test Python service health
curl http://localhost:8000/health

# Test authentication
curl -X POST http://localhost:62001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Test knowledge search
curl -X POST http://localhost:8000/search \
  -H "Content-Type: application/json" \
  -d '{
    "kb_id": "KB_ID",
    "query": "test query",
    "top_k": 5
  }'

# Test chat endpoint
curl -X POST http://localhost:62001/api/chat/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "session_id": "test-session",
    "agent_id": "AGENT_ID",
    "message": "Hello"
  }'
```

### System Health Checks

```bash
# Check all services
pm2 status

# Check system resources
htop
# or
top

# Check disk space
df -h

# Check memory usage
free -h

# Check network connectivity
ping -c 5 api.openai.com

# Check DNS resolution
nslookup api.openai.com

# Check open ports
netstat -tuln | grep -E ':(62001|8000|6379|3306)'

# Check process count
ps aux | wc -l

# Check load average
uptime
```

---

## Escalation Procedures

### When to Escalate

**Escalate to Level 2 Support when:**
- Issue persists after all troubleshooting steps
- Database corruption suspected
- System-wide outage affecting multiple users
- Security breach suspected
- Data loss or corruption
- Payment/billing disputes requiring manual intervention
- Custom code modification needed

**Escalate to Development Team when:**
- Bug in application code confirmed
- Feature request disguised as support issue
- API integration issue with third-party service
- Performance optimization needed
- Database schema changes required
- New feature needed to resolve issue

### Escalation Information to Provide

**Always include:**
1. **User Information**
   - Email address
   - Tenant ID
   - User role
   
2. **Issue Details**
   - Clear description of problem
   - When it started
   - Frequency (always, sometimes, once)
   - Number of users affected
   
3. **Steps Taken**
   - All troubleshooting steps attempted
   - Results of each step
   - Any error messages captured
   
4. **Technical Details**
   - Relevant log excerpts
   - Database query results
   - API response examples
   - Browser/device information
   
5. **Business Impact**
   - Priority level (Critical/High/Medium/Low)
   - Revenue impact if applicable
   - Number of users affected
   - Workaround availability

### Priority Levels

**P1 - Critical (Escalate Immediately)**
- System completely down
- Security breach
- Data loss
- No workaround available
- Multiple customers affected
- **Response Time:** < 1 hour

**P2 - High (Escalate within 4 hours)**
- Major feature not working
- Significant performance degradation
- Affecting multiple users
- Workaround difficult or incomplete
- **Response Time:** < 4 hours

**P3 - Medium (Escalate within 24 hours)**
- Minor feature not working
- Affecting single user or small group
- Workaround available
- Limited business impact
- **Response Time:** < 24 hours

**P4 - Low (Document, no immediate escalation)**
- Cosmetic issues
- Feature requests
- Questions
- **Response Time:** < 72 hours

---

## Support Contact Information

### Primary Support
- **Email:** support@contegris.com
- **Response Time:** 
  - P1: < 1 hour
  - P2: < 4 hours
  - P3: < 24 hours
  - P4: < 72 hours

### Billing Support
- **Email:** billing@contegris.com
- **Response Time:** < 24 hours

### Technical Documentation
- **Help Center:** https://your-domain.com/aiva/help
- **API Docs:** https://your-domain.com/aiva/api-docs
- **Status Page:** https://status.contegris.com

---

## Changelog

**Version 1.0** - November 2024
- Initial troubleshooting guide created
- All major issue categories covered
- Diagnostic procedures documented
- Quick reference guide added

---

**End of Troubleshooting Guide**

*Keep this document updated as new issues are discovered and resolved.*
*Add new sections as needed based on common support tickets.*
