// DT POS Assistant — built-in software guide.
// 100% local: no Gemini, no API key, no external calls. Knowledge-base driven.

import { cloudDb } from '@/lib/offlineNoCloud';
import { doc, getDoc, setDoc, serverTimestamp } from '@/lib/offlineNoCloud';

export type AIMode = 'off' | 'manual' | 'ai' | 'ai_human';
export type IssueIntent = 'bug' | 'feature' | 'improvement' | 'urgent' | 'question';

export interface AIConfig {
  mode: AIMode;
  /** @deprecated kept for backward compat — no key is required to run the DT POS Assistant. */
  apiKey?: string;
  model?: string;
  updatedAt?: any;
}

const CFG_DOC = ['globalSettings', 'aiAssistant'] as const;

export async function getAIConfig(): Promise<AIConfig> {
  try {
    const s = await getDoc(doc(cloudDb(), CFG_DOC[0], CFG_DOC[1]));
    // Default mode = 'ai' (built-in DT POS Assistant on)
    if (!s.exists()) return { mode: 'ai' };
    const data = s.data() as AIConfig;
    return { mode: data.mode || 'ai', ...data };
  } catch (e) {
    console.warn('getAIConfig', e);
    return { mode: 'ai' };
  }
}

export async function setAIConfig(cfg: Partial<AIConfig>) {
  await setDoc(
    doc(cloudDb(), CFG_DOC[0], CFG_DOC[1]),
    { ...cfg, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

/* ---------- Intent classifier ---------- */

const BUG_HINTS    = /\b(bug|error|crash|fail|kaam nahi|nahi chal|nahi ho|broken|hang|stuck|wrong|galat|problem|masla|issue|blank|print nahi)\b/i;
const FEATURE_HINTS= /\b(feature|chahiye|add karo|add kar|option ho|hona chahiye|request|suggest|naya|new|please add)\b/i;
const URGENT_HINTS = /\b(urgent|jaldi|abhi|emergency|critical|production|down|live)\b/i;

export function classifyIntent(text: string): IssueIntent {
  const t = (text || '').toLowerCase();
  if (URGENT_HINTS.test(t) && BUG_HINTS.test(t)) return 'urgent';
  if (BUG_HINTS.test(t)) return 'bug';
  if (FEATURE_HINTS.test(t)) return 'feature';
  if (URGENT_HINTS.test(t)) return 'urgent';
  return 'question';
}

/* ---------- Local DT POS Assistant Knowledge Bank ----------
   100% offline. No API key. Keyword-weighted scoring across all software modules. */

interface KBEntry {
  topic: string;
  keywords: RegExp;
  /** extra weight when these words also appear (boosts disambiguation) */
  boost?: RegExp;
  answer: string;
}

const KB: KBEntry[] = [
  {
    topic: 'Printer',
    keywords: /\b(printer|print|kot|receipt|slip|thermal|escpos|lan|usb|blank|paper|80mm|58mm|cashdraw)\b/i,
    boost: /\b(blank|nahi aata|not printing|setup|test)\b/i,
    answer:
`🖨️ **Printer Setup & Troubleshooting**

• Open **Settings → Printer Settings**.
• **USB**: Set the default printer in Windows → press "Test Print".
• **LAN**: Enter IP + Port 9100 → Test Print.
• Paper size: correctly select 80mm or 58mm.
• If a blank slip prints: check paper width, reinstall driver, check ESC/POS mode.
• KOT auto-print: happens when "Send to Kitchen" is pressed in POS.
• Old bill: **Bill Reprint** page (with audit log).
• Manual reprint: **Reprint Bill / Reprint KOT** options on the Bill page.`,
  },
  {
    topic: 'Deals & Variants',
    keywords: /\b(deal|combo|variant|variation|pizza|burger|size|small|medium|large|topping|modifier|addon|add-on)\b/i,
    answer:
`🍕 **Deal / Variant Setup**

• **Menu Manager → Variations & Deals** kholein.
• Add variants to an item (Small/Medium/Large) — each with its own price.
• To create a deal, tap items POS-style — the variant picker opens.
• Customer Portal: variant items show "From Rs. ___" → picker opens on click.
• POS pe variant item tap karne par variant select karna parta hai.
• Variant editor max-height 300px hai with internal scroll.`,
  },
  {
    topic: 'Reports',
    keywords: /\b(report|sales|revenue|profit|kitna|earning|kharcha|advanced|gross|net|discount|profitability|costing)\b/i,
    answer:
`📊 **Reports Guide**

• **Reports Page**: Daily / Weekly / Monthly sales summary.
• **Advanced Reports**: Item-wise, variant-wise, category, subcategory — Qty, Gross, Discount, Net.
• **Profitability**: Recipe cost vs sale price, food cost %.
• **Costing Reports**: Wastage + receiving cost breakdown.
• All reports run on the **Business Day** engine (set shift timing in Settings).
• PDF export aur 80mm thermal print dono available.`,
  },
  {
    topic: 'Login',
    keywords: /\b(login|sign in|signin|password|locked|lock|please wait|loading|email yaad|remember|save)\b/i,
    answer:
`🔐 **Login & Account**

• Check the email and password are correct (capital/small letters).
• **Remember Me** ab default ON hai — Windows aur Web dono pe email auto-save hota hai.
• "Switch Account" press karke saved email clear hota hai.
• The device must be approved — get it approved from the Devices page.
• If the plan expires, POS locks — contact Digital Target.
• If "Please Wait" gets stuck, press Ctrl+R (Reload).`,
  },
  {
    topic: 'Update',
    keywords: /\b(update|version|install|upgrade|setup|exe|windows app|new build|release)\b/i,
    answer:
`⬆️ **Update Guide**

• Press "Check for Updates" from the **Tenant → Version page**.
• Naya .exe download → install → app khud apni version update kar leti hai.
• Update se pehle **automatic backup** (Zero Data Loss System).
• Update History: **Update Safety** page.
• Super Admin can see every device's version and status.`,
  },
  {
    topic: 'Backup',
    keywords: /\b(backup|restore|data loss|safety|rollback|repair|export|import)\b/i,
    answer:
`🛡️ **Data Safety**

• **Update Safety** page (#/update-safety) se manual backup len.
• Cloud + Local dono jagah save hota hai.
• "Inspect & Repair" se database health check + auto-fix.
• An automatic snapshot is saved to the cloud before an update installs.
• Restore Super Admin ke through hota hai security ke liye.`,
  },
  {
    topic: 'Inventory',
    keywords: /\b(inventory|stock|kg|gram|litre|liter|pcs|piece|recipe|ingredient|wastage|receiving|supplier|party)\b/i,
    answer:
`📦 **Inventory & Recipes**

• **Inventory**: Stock units (Kg / Gram / Litre / Pcs).
• **Receiving**: Supplier (Party Master) se stock add with cost.
• **Recipes**: Define each item's ingredients → auto deduct on order.
• **Wastage**: Reason ke saath spoilage record → profit me deduct.
• **Costing Report**: Actual food cost % nikalti hai.`,
  },
  {
    topic: 'Foodpanda',
    keywords: /\b(foodpanda|food panda|aggregator|3rd party|third party)\b/i,
    answer:
`🛵 **Foodpanda Mode**

• Turn ON "Enable Foodpanda Mode" in Settings.
• POS me extra order type button aata hai.
• **Foodpanda Orders** page: New → Preparing → Ready → Picked → Delivered.
• Separate filter aur report bhi.`,
  },
  {
    topic: 'Customers',
    keywords: /\b(customer|crm|loyalty|phone|address|blocked|caller|repeat)\b/i,
    answer:
`👥 **Customer Management**

• **Customers Page**: Phone number se add — name, address, loyalty points.
• **CRM Insights**: Top customers, repeat rate.
• **Blocked Customers / Locations**: Block spam or fake orders.
• POS pe phone enter karte hi customer auto-fill hota hai.`,
  },
  {
    topic: 'Riders',
    keywords: /\b(rider|delivery boy|driver|pin|map|gps|live|tracking|dispatch)\b/i,
    answer:
`🏍️ **Riders & Delivery**

• **Riders List**: Add with phone + 4-digit PIN.
• Rider Public URL → PIN se login → claim orders.
• **Live Riders Map**: real-time GPS tracking.
• **Delivery Board**: assignment + status dashboard.
• As soon as a rider picks up, the order auto-clears from the Kitchen Display.`,
  },
  {
    topic: 'Business Day',
    keywords: /\b(business day|shift|timing|date range|kal|aaj|late night|opening|closing)\b/i,
    answer:
`⏰ **Business Day Engine**

• Set the shift in Settings → "Business Day Timing" (e.g. 08:00 to 03:00 next day).
• Sab dashboards aur reports usi shift window pe sales group karte hain.
• Shift-based grouping instead of calendar date — late night sales are credited to the right day.`,
  },
  {
    topic: 'Users & Roles',
    keywords: /\b(user|role|permission|access|cashier|manager|waiter|kitchen staff|staff add)\b/i,
    answer:
`👤 **Users & Roles**

• Add new staff from the **Users & Roles** page.
• Roles: Owner, Manager, Cashier, Waiter, Kitchen, Rider.
• Per-page access can be toggled.
• Sensitive actions (discount, void, bill edit) role-based locked hain.
• Bill Editor is only available to Admin / Manager, with audit history.`,
  },
  {
    topic: 'Online Portal',
    keywords: /\b(online|website|portal|qr code|menu link|public|web order)\b/i,
    answer:
`🌐 **Online Ordering**

• Enable the public website link from the **Online Portal** page.
• Customer order → Owner approval → POS me enter.
• Turn ON the "Show on website" toggle on menu items.
• Variant items "From Rs. ___" show hote hain.
• Generate table QR codes from the **Tables Page**.`,
  },
  {
    topic: 'Subscription',
    keywords: /\b(subscription|plan|expire|renew|payment|billing|invoice|trial)\b/i,
    answer:
`💳 **Subscription**

• Plans: Trial, Basic, Standard, Pro.
• Renewal Super Admin manage karta hai.
• When the plan expires, POS locks.
• Renewal: 📧 digitaltarget.digital@gmail.com`,
  },
  {
    topic: 'Devices',
    keywords: /\b(device|approve|new device|hardware|monitor|block device|delete device|machine|computer)\b/i,
    answer:
`💻 **Device Control (Restaurant Admin)**

• **Devices Page** (Admin sidebar) se aapne device khud manage kar saktay hain.
• **Actions**: Approve · Block / Unblock · Delete · PDF Ledger.
• When a new device logs in for the first time it stays pending — auto-approved within the plan limit.
• Super Admin can also see live activity (Online/Offline, Last Seen).
• As soon as it's blocked / deleted, that device is instantly logged out.`,
  },
  {
    topic: 'Sync',
    keywords: /\b(sync|offline|internet|cloud|realtime|slow)\b/i,
    answer:
`☁️ **Sync & Offline**

• App offline kaam karti hai — orders local me save hote hain.
• Internet wapas aate hi auto-sync.
• Sync status badge sidebar me dikhta hai.
• realtime cloud listeners se products / orders live update hote hain.
• For slow sync, use Settings → Inspect & Repair.`,
  },
  {
    topic: 'Running / Hold Bills',
    keywords: /\b(running|retry|hold|unpaid|pending bill|open bill|kot bill)\b/i,
    answer:
`🧾 **Running / Retry / Hold Bills**

• Until a bill is paid, it stays in Running/Retry/Hold.
• Unpaid bills pe red **UNPAID** badge lagta hai.
• Delivery bill pe 🛵 Rider name, Dining bill pe 🧑‍🍳 Waiter name show hota hai.
• Paid hone ke baad hi report me count hota hai.`,
  },
  {
    topic: 'Bill Edit',
    keywords: /\b(bill edit|edit bill|change quantity|remove item|discount edit|recalculate|audit)\b/i,
    answer:
`✏️ **Bill Editor (Admin / Manager)**

• Item add / edit / remove / quantity change.
• Discount add / edit / remove with auto total recalculation.
• Sirf Admin / Manager access.
• Har change ki **audit history**: kisne kiya, kab kiya.`,
  },
  {
    topic: 'KDS',
    keywords: /\b(kds|kitchen display|kitchen screen|delayed|preparing|ready ticket)\b/i,
    answer:
`👨‍🍳 **Kitchen Display (KDS)**

• Sirf active orders show hote hain: Pending / Preparing / In Progress.
• Served / Dispatched / Delivered / Paid orders auto-remove.
• As soon as a rider picks up, the delivery order leaves the KDS.
• Delayed status sirf tab dikhta hai jab order waqai stuck ho.`,
  },
  {
    topic: 'Duplicate KOT',
    keywords: /\b(duplicate|double print|double kot|same order twice)\b/i,
    answer:
`🛑 **Duplicate KOT / Order Prevention**

• A 4-second signature lock on the order create button — double-clicking does not create a duplicate.
• Ek order pe ek hi KOT print.
• Print queue level pe bhi dedupe.
• Manual reprint alag section se: Reprint Bill / Reprint KOT.`,
  },
  {
    topic: 'WhatsApp',
    keywords: /\b(whatsapp|wa|message customer|broadcast)\b/i,
    answer:
`💬 **WhatsApp**

• **WhatsApp Page** se customer ko receipt / order update bhejein.
• Marketing contacts panel se broadcast filter.
• Floating WA button har page pe.`,
  },
  {
    topic: 'Super Admin',
    keywords: /\b(super admin|portfolio|all restaurants|fleet|global)\b/i,
    answer:
`👑 **Super Admin Tools**

• **Portfolio Dashboard**: total sale, orders, revenue across all restaurants.
• **Versions Page**: fleet version + update status.
• **AI Assistant Inbox**: restaurant messages forward yahan hote hain.
• **Update Safety Page**: backups + repair history.
• **Live Map**: device locations real-time.`,
  },
  {
    topic: 'Contact',
    keywords: /\b(contact|support|help|email|whatsapp number|phone number|digital target)\b/i,
    answer:
`📞 **Digital Target Support**

• 📧 **digitaltarget.digital@gmail.com**
• ☎ 0345-1873354
• In-app: Support Chat Widget (Dashboard / Settings page ke neechay).`,
  },
  {
    topic: 'Greeting',
    keywords: /\b(hello|salam|hi|hey|assalam|good morning|good evening|shukriya|thanks|theek|ok)\b/i,
    answer:
`👋 **Hello!**

I'm **DT POS Assistant** — your built-in software guide.
Ask me about:
• 🖨️ Printer · 📊 Reports · 🍕 Deal/Variant
• 📦 Inventory · 🛵 Foodpanda · 🏍️ Riders
• 💻 Devices · ⬆️ Update · 🛡️ Backup
• 🧾 Running/Hold Bills · ✏️ Bill Edit · 👨‍🍳 KDS
• 💳 Subscription · 👥 Customers · 👤 Users

Or describe any issue — if I can't find a confident answer, I'll forward it to Super Admin.`,
  },
];

function buildFallback(): string {
  const topics = Array.from(new Set(KB.map(k => k.topic))).filter(t => t !== 'Greeting');
  return `🤔 I couldn't confirm an exact answer to this question.

Try one of these topic keywords:
${topics.map(t => `• ${t}`).join('\n')}

Or describe your question in a bit more detail (e.g. "LAN printer setup", "creating a deal", "bill edit history").

📩 Your message has been forwarded to the **Digital Target Support team**.
📧 digitaltarget.digital@gmail.com`;
}

/* ---------- Public reply generator ---------- */

export interface AIReplyInput {
  userMessage: string;
  category?: string;
  restaurantName?: string;
  branchName?: string;
  userName?: string;
  version?: string;
  history?: { from: 'owner' | 'admin'; body: string }[];
}

function scoreEntry(msg: string, entry: KBEntry): number {
  const matches = msg.match(new RegExp(entry.keywords.source, 'gi'));
  if (!matches) return 0;
  let score = matches.length * 2;
  if (entry.boost) {
    const b = msg.match(new RegExp(entry.boost.source, 'gi'));
    if (b) score += b.length * 3;
  }
  // Topic name mention boost
  if (msg.toLowerCase().includes(entry.topic.toLowerCase())) score += 4;
  return score;
}

export async function generateAIReply(input: AIReplyInput): Promise<string> {
  await new Promise(r => setTimeout(r, 250));

  const msg = (input.userMessage || '').trim();
  if (!msg) return buildFallback();

  // Score every KB entry, pick top 2 — combine if very close
  const scored = KB.map(entry => ({ entry, score: scoreEntry(msg, entry) }))
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const intent = classifyIntent(msg);
  const greet = input.userName ? `Hi ${input.userName}, ` : '';

  if (scored.length > 0) {
    const top = scored[0];
    let reply = `${greet}\n\n${top.entry.answer}`;

    // If a second topic also scored close, append a "related" hint
    if (scored.length > 1 && scored[1].score >= Math.max(2, top.score - 2) && scored[1].entry.topic !== top.entry.topic) {
      reply += `\n\n🔗 **Related**: You can also ask about ${scored[1].entry.topic}.`;
    }

    if (intent === 'bug' || intent === 'urgent') {
      reply += `\n\n📩 This issue has been forwarded to the **Digital Target Support team** — they will follow up soon.`;
    } else if (intent === 'feature') {
      reply += `\n\n✨ Your feature request has been noted — the team will review it.`;
    }
    return reply.trim();
  }

  return `${greet}\n\n${buildFallback()}`;
}

