(function () {
  var grid = document.getElementById("highlights-grid");
  var moreBtn = document.getElementById("highlights-more");
  if (grid && moreBtn) {
    var moreLabel = moreBtn.querySelector(".home-highlights__more-label");
    moreBtn.addEventListener("click", function () {
      var expanded = grid.classList.toggle("is-expanded");
      moreBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (moreLabel) {
        moreLabel.textContent = expanded
          ? "View less product upgrades"
          : "View more product upgrades";
      }
    });
  }

  var downloadLink = document.getElementById("home-download");
  var downloadLabel = document.getElementById("home-download-label");
  if (!downloadLink || !downloadLabel) return;

  var ua = navigator.userAgent.toLowerCase();
  var platform = (navigator.platform || "").toLowerCase();
  var isWindows = ua.includes("windows") || platform.includes("win");

  if (isWindows) {
    downloadLink.href = "/downloads/Lyte-windows.exe";
    downloadLabel.textContent = "Download for Windows";
    downloadLink.setAttribute(
      "aria-label",
      "Download Lyte for Windows",
    );
  } else {
    downloadLink.href = "/downloads/Lyte-mac.dmg";
    downloadLabel.textContent = "Download for macOS";
    downloadLink.setAttribute(
      "aria-label",
      "Download Lyte for macOS",
    );
  }
})();
