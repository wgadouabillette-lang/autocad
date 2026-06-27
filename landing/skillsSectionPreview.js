(function () {
  var root = document.getElementById("skills");
  var figure = root && root.querySelector(".hero__shot--skills");
  var stage = document.getElementById("skills-cascade-stage");
  var list = document.getElementById("skills-cascade-list");
  var typing = document.getElementById("skills-composer-typing");
  var placeholder = document.getElementById("skills-field-placeholder");
  var fieldValue = document.getElementById("skills-field-value");
  var caret = document.getElementById("skills-field-caret");
  var managePrompt = document.getElementById("skills-manage-prompt");
  var manageRow = document.getElementById("skills-row-manage");
  var taskInput = document.getElementById("skills-manage-task");
  var durationInput = document.getElementById("skills-manage-duration");
  var deadlineInput = document.getElementById("skills-manage-deadline");
  var pointer = document.getElementById("skills-pointer");
  var composerField = document.getElementById("skills-composer-field");

  if (
    !root ||
    !figure ||
    !stage ||
    !list ||
    !typing ||
    !placeholder ||
    !fieldValue ||
    !caret ||
    !managePrompt ||
    !pointer ||
    !composerField
  ) {
    return;
  }

  var CYCLE_MS = 24000;
  var IDLE_MS = 900;
  var CARET_MS = 450;
  var CASCADE_MS = 620;
  var POINTER_TRAVEL_MS = 1600;
  var POINTER_HOVER_MS = 400;
  var POINTER_CLICK_MS = 320;
  var FILL_START_MS = 520;
  var FILL_GAP_MS = 850;
  var FILL_CHAR_MS = 108;
  var FILL_CHAR_SPACE_MS = 185;
  var FILL_CHAR_PAUSE_MS = 220;
  var DEMO_TASK = "Review pitch deck";
  var DEMO_DURATION = "30 min";
  var DEMO_DEADLINE = "Friday 6pm";

  var timers = [];

  function clearTimers() {
    while (timers.length) {
      window.clearTimeout(timers.pop());
    }
  }

  function schedule(fn, delay) {
    timers.push(window.setTimeout(fn, delay));
  }

  function clearManageFields() {
    if (taskInput) taskInput.value = "";
    if (durationInput) durationInput.value = "";
    if (deadlineInput) deadlineInput.value = "";
  }

  function typeIntoInput(input, text, done) {
    if (!input) {
      if (done) done();
      return;
    }

    input.value = "";
    var index = 0;

    function step() {
      if (index >= text.length) {
        if (done) done();
        return;
      }

      var char = text.charAt(index);
      input.value += char;
      index += 1;

      var delay = char === " " ? FILL_CHAR_SPACE_MS : FILL_CHAR_MS;
      if (index > 1 && index % 5 === 0) {
        delay += FILL_CHAR_PAUSE_MS;
      }

      schedule(step, delay);
    }

    step();
  }

  function fillManageFields() {
    typeIntoInput(taskInput, DEMO_TASK, function () {
      schedule(function () {
        typeIntoInput(durationInput, DEMO_DURATION, function () {
          schedule(function () {
            typeIntoInput(deadlineInput, DEMO_DEADLINE);
          }, FILL_GAP_MS);
        });
      }, FILL_GAP_MS);
    });
  }

  function resetPointer() {
    pointer.hidden = true;
    pointer.classList.remove("is-visible", "is-moving", "is-clicking");
    pointer.style.transition = "none";
    pointer.style.transform = "translate(0, 0)";
  }

  function reset() {
    stage.hidden = true;
    list.classList.remove("is-animating");
    if (manageRow) {
      manageRow.classList.remove("chat-skills-row--active", "is-clicked");
    }
    composerField.classList.remove("is-manage-prompt");
    typing.classList.remove("is-slash", "is-manage-prompt");
    placeholder.hidden = false;
    fieldValue.hidden = true;
    fieldValue.textContent = "/";
    caret.hidden = true;
    managePrompt.hidden = true;
    clearManageFields();
    resetPointer();
  }

  function showSlashAndSkills() {
    typing.classList.add("is-slash");
    placeholder.hidden = true;
    fieldValue.hidden = false;
    caret.hidden = false;
    stage.hidden = false;
    list.classList.remove("is-animating");
    void list.offsetWidth;
    list.classList.add("is-animating");
  }

  function showManagePrompt() {
    stage.hidden = true;
    list.classList.remove("is-animating");
    if (manageRow) {
      manageRow.classList.remove("chat-skills-row--active", "is-clicked");
    }

    typing.classList.remove("is-slash");
    typing.classList.add("is-manage-prompt");
    composerField.classList.add("is-manage-prompt");
    placeholder.hidden = true;
    fieldValue.hidden = true;
    fieldValue.textContent = "";
    caret.hidden = true;
    managePrompt.hidden = false;
    clearManageFields();
    schedule(fillManageFields, FILL_START_MS);
  }

  function movePointerToTarget(targetEl) {
    var rootRect = root.getBoundingClientRect();
    var figureRect = figure.getBoundingClientRect();
    var toRect = targetEl.getBoundingClientRect();

    var startX = figureRect.right - rootRect.left + 56;
    var startY = figureRect.bottom - rootRect.top + 44;
    var endX = toRect.left - rootRect.left + toRect.width * 0.58;
    var endY = toRect.top - rootRect.top + toRect.height * 0.5;
    var dx = endX - startX;
    var dy = endY - startY;

    resetPointer();
    pointer.style.left = startX + "px";
    pointer.style.top = startY + "px";
    pointer.hidden = false;

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        pointer.style.transition = "";
        pointer.classList.add("is-visible", "is-moving");
        pointer.style.transform = "translate(" + dx + "px, " + dy + "px)";
      });
    });

    schedule(function () {
      pointer.classList.remove("is-moving");
      pointer.classList.add("is-clicking");
      if (manageRow) {
        manageRow.classList.add("chat-skills-row--active", "is-clicked");
      }
      showManagePrompt();

      schedule(function () {
        pointer.classList.remove("is-visible", "is-clicking");
        schedule(resetPointer, 180);
      }, POINTER_CLICK_MS);
    }, POINTER_TRAVEL_MS + POINTER_HOVER_MS);
  }

  function runSequence() {
    clearTimers();
    reset();

    schedule(function () {
      placeholder.hidden = true;
      caret.hidden = false;
    }, IDLE_MS);

    schedule(showSlashAndSkills, IDLE_MS + CARET_MS);

    schedule(function () {
      if (!manageRow) {
        showManagePrompt();
        return;
      }
      movePointerToTarget(manageRow);
    }, IDLE_MS + CARET_MS + CASCADE_MS);
  }

  runSequence();
  window.setInterval(runSequence, CYCLE_MS);
})();
