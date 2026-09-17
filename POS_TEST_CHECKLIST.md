# DT POS — End-to-End Test Checklist

Har release / naye computer par yeh list upar se neeche chalayein. Har line ke saamne ✅ / ❌ lagayein.

---

## 0. Pehla setup (sirf ek baar)
| # | Step | Expected |
|---|------|----------|
| 0.1 | Licence key Super Admin se generate kar ke POS me daalein | Activation screen plan, computers, expiry dikhaye |
| 0.2 | Activate dabayein | "Device remembered" message + login hint `admin / admin123` |
| 0.3 | Software band kar ke dobara kholein | Licence dobara na maange |
| 0.4 | Login `admin / admin123` | Dashboard khul jaye |
| 0.5 | Settings → Printer Settings → Printer Health | Counter printer **Connected** (green) |
| 0.6 | Test Print (Silent) | Receipt sahi margins ke sath nikle |

## 1. New Bill
| # | Step | Expected |
|---|------|----------|
| 1.1 | Item click / barcode scan | Cart me add ho, total sahi |
| 1.2 | Quantity +/- aur item delete | Total foran update |
| 1.3 | Discount / Delivery / Takeaway type change | Grand total sahi |
| 1.4 | Customer name + phone | Bill par print ho |

## 2. Hold / Running
| # | Step | Expected |
|---|------|----------|
| 2.1 | **F2** — Hold | Bill "Hold" list me chala jaye, cart clear |
| 2.2 | **F3** — Running bills | List khule, purana bill retrieve ho |
| 2.3 | Retrieved bill me item add kar ke dobara save | KOT sirf naye item ka nikle (KOT update) |
| 2.4 | Bill cancel | Kitchen cancel slip nikle (agar option ON hai) |

## 3. Payment
| # | Step | Expected |
|---|------|----------|
| 3.1 | **F4** — Pay dialog, cash amount, **Enter** | Bill paid, receipt print |
| 3.2 | **+** button/key | Foran cash paid + print (dialog ke baghair) |
| 3.3 | Partial payment | Due amount sahi, toast me pending dikhe |
| 3.4 | Credit sale | Customer ke credit me chadh jaye |

## 4. Printing
| # | Step | Expected |
|---|------|----------|
| 4.1 | Silent print (default) | 1–2 second me parcha nikle, koi Windows dialog nahi |
| 4.2 | Settings → "Show bill on screen after payment" **OFF** | Screen par kuch na aaye, sirf print |
| 4.3 | Wahi option **ON** | Paid ke baad bill screen par bhi aaye |
| 4.4 | Printer Settings → **Print Preview** ON | Paid ke baad bill screen par, Print dabane par nikle |
| 4.5 | Print Preview OFF | Dobara fast silent print |
| 4.6 | **F8** — last bill reprint | Wahi bill dobara, reprint audit me entry |
| 4.7 | Kitchen slip (KOT) | Kitchen printer par alag parcha, cut sahi |
| 4.8 | 10 bills lagataar | Koi bill miss na ho, screen na atke |

## 5. Printer reconnect (client wala masla)
| # | Step | Expected |
|---|------|----------|
| 5.1 | Printer ka USB nikaal kar doosray port/PC me lagayein | — |
| 5.2 | Printer Settings → **Re-detect** | Status "Not found" ya naya naam dikhaye |
| 5.3 | **Fix printer names** dabayein | Naam Windows ke mutabiq save ho, status Connected |
| 5.4 | Test Print + asli bill | Dono theek nikleen (blank nahi) |
| 5.5 | Printer band kar ke bill print karein | Auto-retry ke baad saaf error toast, bill queue me pending |

## 6. Keyboard shortcuts
| Key | Kaam | ✅ |
|-----|------|----|
| F1 | Search box | |
| F2 | Hold bill | |
| F3 | Running bills | |
| F4 | Pay dialog | |
| + | Foran cash paid + print | |
| F8 | Last bill reprint | |
| Enter | OK / Pay confirm | |
| Esc | Dialog band / numpad clear | |

## 7. Licence & device binding
| # | Step | Expected |
|---|------|----------|
| 7.1 | Wahi key doosray computer par lagayein | Warning: licence already in use — Super Admin approval maange |
| 7.2 | Super Admin → Approve extra computer | Doosra PC chal jaye |
| 7.3 | Super Admin → Move licence (unlink) | Purana PC block, naya chalu |
| 7.4 | Vault copy kar ke doosray PC par rakhein | Print par red popup: "Yeh licence doosray computer ka hai" |
| 7.5 | System date peechay karein | Clock-tamper block popup |
| 7.6 | Expiry ke baad | Expired message + renew ka kehna |

## 8. Data safety (offline)
| # | Step | Expected |
|---|------|----------|
| 8.1 | Bill banate waqt bijli/app band | Dobara kholne par data mojood |
| 8.2 | Backup & Restore → Backup | File PC par save ho |
| 8.3 | Restore | Purana data wapas aa jaye |
| 8.4 | Day close | Report + backup dono banein |

## 9. Super Admin web panel
| # | Step | Expected |
|---|------|----------|
| 9.1 | Login screen → **Test cloud connection** | Authentication ✓, Firestore ✓ |
| 9.2 | Staff email/password sign-in | Panel khule |
| 9.3 | Licence generate | Key ban jaye, Clients list me aaye |
| 9.4 | Activation receipt paste | Client + device map par aa jaye |
| 9.5 | Support message | Dono taraf message dikhe |
| 9.6 | Doosray browser/PC se login | Wahi data live dikhe (cloud sync) |
