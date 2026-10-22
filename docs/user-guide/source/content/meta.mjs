// Cover, back cover and the facts printed on every page.
const version = '1.20.1';
const date = 'October 2026';
const email = 'digitaltarget.digital@gmail.com';
const phone = '+92 345 1873354';

export default {
  version, date, email, phone,
  cover: ({ logoWhite: logo }) => `<section class="page cover" data-page="1">
  <div class="shot"><img src="../screenshots/pos-main.png" alt=""></div>
  <div class="shot second"><img src="../screenshots/pos-payment.png" alt=""></div>
  <div class="inner">
    <div class="logo"><img src="${logo}" alt="Digital Target"><div class="wm">DIGITAL<br>TARGET<small>SMART POS SOLUTIONS</small></div></div>
    <div class="title">
      <div class="eyebrow">User Guide &amp; Feature Overview</div>
      <h1>DT POS Enterprise<span>Offline restaurant POS for Windows</span></h1>
      <div class="meta">
        <div><b>Version ${version}</b>Offline Edition</div>
        <div><b>${date}</b>Edition of this guide</div>
        <div><b>Digital Target</b>Burewala, Pakistan</div>
      </div>
    </div>
    <div class="bar"><span>Every picture in this guide was taken from the running software, with a sample restaurant's data.</span><span>${email} · ${phone}</span></div>
  </div>
</section>`,
  back: ({ logoWhite: logo }) => `<section class="page back">
  <div class="inner">
    <img src="${logo}" alt="Digital Target">
    <h2>Digital Target</h2>
    <p>Smart POS solutions — developed in Burewala, Pakistan.</p>
    <div class="contacts">
      <div><b>Call</b>+92 345 1873354</div>
      <div><b>WhatsApp</b>+92 332 2373354</div>
      <div><b>Email</b>${email}</div>
      <div><b>Website</b>www.digitaltarget.digital</div>
      <div><b>Facebook</b>facebook.com/digitaltargetpk</div>
      <div><b>Instagram</b>@digitaltarget_pk</div>
    </div>
    <p style="margin-top:12mm;font-size:8pt;color:rgba(255,255,255,0.6)">DT POS Enterprise v${version} · User Guide &amp; Feature Overview · © 2026 Digital Target. All rights reserved.</p>
  </div>
</section>`,
};
