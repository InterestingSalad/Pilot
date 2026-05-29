/* Shared top-nav behavior: highlight the active link + toggle the Games menu.
   Kept tiny and dependency-free so every page can just <script src> it. */
(function () {
  "use strict";

  // Highlight whichever nav link matches the current page.
  var here = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav__link[data-match]").forEach(function (a) {
    a.getAttribute("data-match").split(",").forEach(function (name) {
      if (name.trim() === here) a.classList.add("is-active");
    });
  });

  // Click-toggle the dropdown (hover handles desktop; this handles touch).
  var group = document.querySelector(".nav__group");
  var toggle = document.querySelector(".nav__toggle");
  if (group && toggle) {
    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      group.classList.toggle("is-open");
    });
    document.addEventListener("click", function () {
      group.classList.remove("is-open");
    });
  }
})();
