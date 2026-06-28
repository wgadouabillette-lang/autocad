(function () {
  var FILTER_KEYS = ["department", "employment", "location", "workplace"];

  var DEPARTMENT_ORDER = ["design", "engineering", "product"];

  var DEPARTMENT_LABEL_KEYS = {
    design: "careers.dept.design",
    engineering: "careers.dept.engineering",
    product: "careers.dept.product",
  };

  var FILTERS = [
    {
      key: "department",
      labelKey: "careers.filters.department",
      allKey: "careers.filters.allDepartments",
      options: [
        { value: "design", labelKey: "careers.filters.design" },
        { value: "engineering", labelKey: "careers.filters.engineering" },
        { value: "product", labelKey: "careers.filters.product" },
      ],
    },
    {
      key: "employment",
      labelKey: "careers.filters.employment",
      allKey: "careers.filters.allEmployment",
      options: [{ value: "fulltime", labelKey: "careers.filters.fulltime" }],
    },
    {
      key: "location",
      labelKey: "careers.filters.location",
      allKey: "careers.filters.allLocations",
      options: [{ value: "paris-remote", labelKey: "careers.filters.parisRemote" }],
    },
    {
      key: "workplace",
      labelKey: "careers.filters.workplace",
      allKey: "careers.filters.allWorkplaces",
      options: [{ value: "remote", labelKey: "careers.filters.remote" }],
    },
  ];

  var JOBS = [
    {
      id: "product-designer",
      department: "design",
      employment: "fulltime",
      location: "paris-remote",
      workplace: "remote",
      titleKey: "careers.job.designer.title",
      mailSubject: "Application — Product Designer",
    },
    {
      id: "software-engineer-backend",
      department: "engineering",
      employment: "fulltime",
      location: "paris-remote",
      workplace: "remote",
      titleKey: "careers.job.backend.title",
      mailSubject: "Application — Software Engineer, Backend",
    },
    {
      id: "software-engineer-product",
      department: "engineering",
      employment: "fulltime",
      location: "paris-remote",
      workplace: "remote",
      titleKey: "careers.job.productEng.title",
      mailSubject: "Application — Software Engineer, Product",
    },
    {
      id: "technical-product-manager",
      department: "product",
      employment: "fulltime",
      location: "paris-remote",
      workplace: "remote",
      titleKey: "careers.job.tpm.title",
      mailSubject: "Application — Technical Product Manager",
    },
  ];

  var FILTER_OPTION_KEYS = FILTERS.reduce(function (acc, filter) {
    acc[filter.key] = filter.options.reduce(function (options, option) {
      options[option.value] = option.labelKey;
      return options;
    }, {});
    return acc;
  }, {});

  var CHEVRON =
    '<svg viewBox="0 0 640 640" fill="currentColor" aria-hidden="true" class="careers-filter__chevron">' +
    '<path d="M303.5 473C312.9 482.4 328.1 482.4 337.4 473L537.4 273C546.8 263.6 546.8 248.4 537.4 239.1C528 229.8 512.8 229.7 503.5 239.1L320.5 422.1L137.5 239.1C128.1 229.7 112.9 229.7 103.6 239.1C94.3 248.5 94.2 263.7 103.6 273L303.6 473z"></path>' +
    "</svg>";

  function t(key, vars) {
    var locale = window.HallSitePrefs ? window.HallSitePrefs.getLocale() : "en";
    return window.HallLandingI18n ? window.HallLandingI18n.t(key, locale, vars) : key;
  }

  function stripCount(label) {
    return label.replace(/\s*\(\d+\)\s*$/, "");
  }

  function jobMeta(job) {
    return [
      t(DEPARTMENT_LABEL_KEYS[job.department]),
      stripCount(t("careers.filters.parisRemote")),
      stripCount(t("careers.filters.fulltime")),
      stripCount(t("careers.filters.remote")),
    ].join(" • ");
  }

  function mailtoHref(subject) {
    return "mailto:careers@hall.app?subject=" + encodeURIComponent(subject);
  }

  function getFilters() {
    var values = {};
    FILTER_KEYS.forEach(function (key) {
      var select = document.getElementById("careers-filter-" + key);
      values[key] = select ? select.value : "";
    });
    return values;
  }

  function hasActiveFilters(filters) {
    return FILTER_KEYS.some(function (key) {
      return Boolean(filters[key]);
    });
  }

  function jobMatches(job, filters) {
    return FILTER_KEYS.every(function (key) {
      if (!filters[key]) return true;
      return job[key] === filters[key];
    });
  }

  function countJobsMatching(filters, dimension, value) {
    return JOBS.filter(function (job) {
      return FILTER_KEYS.every(function (key) {
        if (key === dimension) {
          if (!value) return true;
          return job[key] === value;
        }
        if (!filters[key]) return true;
        return job[key] === filters[key];
      });
    }).length;
  }

  function labelWithCount(baseKey, count) {
    var label = stripCount(t(baseKey));
    return count > 0 ? label + " (" + count + ")" : label;
  }

  function renderFilters() {
    var root = document.getElementById("careers-filters");
    if (!root) return;

    var filtersHtml = FILTERS.map(function (filter) {
      var optionsHtml = filter.options
        .map(function (option) {
          return (
            '<option value="' +
            option.value +
            '">' +
            labelWithCount(option.labelKey, countJobsMatching({}, filter.key, option.value)) +
            "</option>"
          );
        })
        .join("");

      return (
        '<label class="careers-filter">' +
        '<span class="visually-hidden">' +
        t(filter.labelKey) +
        "</span>" +
        '<select class="careers-filter__select" name="' +
        filter.key +
        '" id="careers-filter-' +
        filter.key +
        '" aria-label="' +
        t(filter.labelKey) +
        '">' +
        '<option value="" disabled hidden selected>' +
        t(filter.labelKey) +
        "</option>" +
        '<option value="">' +
        t(filter.allKey) +
        "</option>" +
        optionsHtml +
        "</select>" +
        CHEVRON +
        "</label>"
      );
    }).join("");

    root.innerHTML =
      '<div class="careers-filters__header">' +
      '<span class="careers-filters__label">' +
      t("careers.filters.label") +
      "</span>" +
      '<button type="button" class="careers-filters__reset" id="careers-reset-filters" disabled tabindex="-1">' +
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" aria-hidden="true" fill="currentColor" class="careers-filters__reset-icon">' +
      '<path d="M28.485 28.485L80.65 80.65C125.525 35.767 187.515 8 255.999 8 392.66 8 504.1 119.525 504 256.185 503.9 393.067 392.905 504 256 504c-63.926 0-122.202-24.187-166.178-63.908-5.113-4.618-5.353-12.561-.482-17.433l19.738-19.738c4.498-4.498 11.753-4.785 16.501-.552C160.213 433.246 205.895 452 256 452c108.321 0 196-87.662 196-196 0-108.321-87.662-196-196-54.163 0-103.157 21.923-138.614 57.386l54.128 54.129c7.56 7.56 2.206 20.485-8.485 20.485H20c-6.627 0-12-5.373-12-12V36.971c0-10.691 12.926-16.045 20.485-8.486z"></path>' +
      "</svg>" +
      "<span>" +
      t("careers.filters.reset") +
      "</span>" +
      "</button>" +
      "</div>" +
      '<div class="careers-filters__row">' +
      filtersHtml +
      "</div>" +
      '<p class="visually-hidden" id="careers-filter-status" role="status" aria-live="polite">' +
      t("careers.filters.noneApplied") +
      "</p>";

    wireFilters();
  }

  function renderJobs() {
    var root = document.getElementById("careers-departments");
    if (!root) return;

    root.innerHTML = DEPARTMENT_ORDER.map(function (department) {
      var jobs = JOBS.filter(function (job) {
        return job.department === department;
      });

      var jobsHtml = jobs
        .map(function (job) {
          return (
            '<li data-job-id="' +
            job.id +
            '">' +
            '<a class="careers-job" href="' +
            mailtoHref(job.mailSubject) +
            '" data-department="' +
            job.department +
            '" data-employment="' +
            job.employment +
            '" data-location="' +
            job.location +
            '" data-workplace="' +
            job.workplace +
            '">' +
            '<span class="careers-job__title">' +
            t(job.titleKey) +
            "</span>" +
            '<span class="careers-job__meta">' +
            jobMeta(job) +
            "</span>" +
            "</a>" +
            "</li>"
          );
        })
        .join("");

      return (
        '<section class="careers-department" data-department="' +
        department +
        '">' +
        '<h3 class="careers-department__heading">' +
        t(DEPARTMENT_LABEL_KEYS[department]) +
        "</h3>" +
        '<ul class="careers-jobs">' +
        jobsHtml +
        "</ul>" +
        "</section>"
      );
    }).join("");
  }

  function updateFilterOptions(filters) {
    Object.keys(FILTER_OPTION_KEYS).forEach(function (dimension) {
      var select = document.getElementById("careers-filter-" + dimension);
      if (!select) return;
      Object.keys(FILTER_OPTION_KEYS[dimension]).forEach(function (value) {
        var option = select.querySelector('option[value="' + value + '"]');
        if (!option) return;
        var count = countJobsMatching(filters, dimension, value);
        option.textContent = labelWithCount(FILTER_OPTION_KEYS[dimension][value], count);
        option.hidden = count === 0;
        option.disabled = count === 0;
      });
    });
  }

  function updateDepartments(filters) {
    var visibleCount = 0;

    document.querySelectorAll(".careers-department").forEach(function (section) {
      var jobs = section.querySelectorAll(".careers-job");
      var sectionVisible = 0;

      jobs.forEach(function (jobEl) {
        var job = JOBS.find(function (entry) {
          return entry.id === jobEl.closest("[data-job-id]").getAttribute("data-job-id");
        });
        var show = job && jobMatches(job, filters);
        jobEl.closest("li").hidden = !show;
        if (show) sectionVisible += 1;
      });

      section.hidden = sectionVisible === 0;
      visibleCount += sectionVisible;
    });

    var empty = document.getElementById("careers-empty");
    if (empty) empty.hidden = visibleCount > 0;

    var countEl = document.getElementById("careers-job-count");
    if (countEl) countEl.textContent = "(" + visibleCount + ")";

    return visibleCount;
  }

  function updateFilterStatus(filters, visibleCount) {
    var status = document.getElementById("careers-filter-status");
    var reset = document.getElementById("careers-reset-filters");
    var active = hasActiveFilters(filters);

    if (reset) {
      reset.disabled = !active;
      reset.tabIndex = active ? 0 : -1;
    }

    if (!status) return;

    status.textContent = active
      ? t("careers.filters.applied", { count: visibleCount })
      : t("careers.filters.noneApplied");
  }

  function applyFilters() {
    var filters = getFilters();
    var visibleCount = updateDepartments(filters);
    updateFilterOptions(filters);
    updateFilterStatus(filters, visibleCount);
  }

  function resetFilters() {
    FILTER_KEYS.forEach(function (key) {
      var select = document.getElementById("careers-filter-" + key);
      if (select) select.value = "";
    });
    applyFilters();
  }

  function wireFilters() {
    FILTER_KEYS.forEach(function (key) {
      var select = document.getElementById("careers-filter-" + key);
      if (!select) return;
      select.addEventListener("change", applyFilters);
    });

    var reset = document.getElementById("careers-reset-filters");
    if (reset) reset.addEventListener("click", resetFilters);
  }

  function refreshBoard() {
    var filters = getFilters();
    renderFilters();
    FILTER_KEYS.forEach(function (key) {
      var select = document.getElementById("careers-filter-" + key);
      if (select && filters[key]) select.value = filters[key];
    });
    renderJobs();
    applyFilters();
  }

  function init() {
    renderFilters();
    renderJobs();
    applyFilters();
  }

  document.addEventListener("lyte-landing:locale", refreshBoard);

  window.HallCareersPage = {
    applyFilters: applyFilters,
    resetFilters: resetFilters,
    refreshBoard: refreshBoard,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
