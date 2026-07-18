document.documentElement.classList.add("js");

const menuButton = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("[data-menu]");

function closeMenu() {
  if (!menuButton || !menu) return;
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open navigation");
  menu.classList.remove("is-open");
}

if (menuButton && menu) {
  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
    menu.classList.toggle("is-open", !isOpen);
  });

  menu.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) closeMenu();
  });
}

const revealObserver = "IntersectionObserver" in window
  ? new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 }
    )
  : null;

document.querySelectorAll(".reveal").forEach((element) => {
  if (revealObserver) revealObserver.observe(element);
  else element.classList.add("is-visible");
});

const stateCheckoutLinks = {
  "Illinois (MISO)": "https://buy.stripe.com/28E28q0xfaX024r7KAcMM02",
  "Texas (ERCOT)": "https://buy.stripe.com/eVq3cueo5ghk7oLgh6cMM0k",
  "California (CAISO)": "https://buy.stripe.com/14AeVc7ZH6GK7oL3ukcMM0l",
  "New York (NYISO)": "https://buy.stripe.com/cNi9ASdk11mqaAX9SIcMM0n",
  "Ohio (PJM)": "https://buy.stripe.com/aFa6oG6VDd586kH4yocMM0o",
  "Indiana (MISO)": "https://buy.stripe.com/7sY6oG4Nvfdg6kH2qgcMM0p",
  "New Jersey (PJM)": "https://buy.stripe.com/7sY9AS4NvghkfVh7KAcMM0q",
  "Massachusetts (ISO-NE)": "https://buy.stripe.com/9B64gy5Rz0im6kH4yocMM0r",
};

const stateSelector = document.querySelector("#single-state-selector");
const stateCheckout = document.querySelector("#single-state-plan-link");

if (stateSelector && stateCheckout) {
  stateSelector.addEventListener("change", () => {
    stateCheckout.href = stateCheckoutLinks[stateSelector.value] || stateCheckoutLinks["Illinois (MISO)"];
  });
}

const year = document.querySelector("[data-year]");
if (year) year.textContent = new Date().getFullYear();
