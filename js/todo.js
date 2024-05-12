let app = new Vue({
  el: "#app",
  data() {
    return {
      tasks: [],
    };
  },
  watch: {
    tasks: {
      handler() {
        const vm = this;
        vm.saveCurrent();
      },
      deep: true,
    },
  },
  mounted() {
    const vm = this;
    let saveTasks = localStorage.getItem("tasks");
    if (saveTasks) {
      saveTasks = JSON.parse(saveTasks);
    } else {
      saveTasks = [
        {
          name: "",
          useLimit: true,
          task: [],
        },
      ];
    }
    vm.$set(vm, "tasks", saveTasks);
  },
  methods: {
    window: (onload = () => {
      setClassLimitDateForAll();
    }),
    addClass($event) {
      $event.target.classList.remove("bg-info");
      $event.target.classList.add("hover");
    },
    removeClass($event) {
      $event.target.classList.remove("hover");
      $event.target.classList.add("bg-info");
    },
    saveCurrent() {
      const vm = this;
      console.log(vm.tasks);
      localStorage.setItem("tasks", JSON.stringify(vm.tasks));
      setClassLimitDateForAll();
    },
    addTask(item) {
      const vm = this;
      item.task.push({
        name: "",
        useLimit: true,
        notes: [],
      });
    },
    addGroup() {
      const vm = this;
      vm.tasks.push({
        name: "",
        useLimit: true,
        task: [],
      });
    },
    addNote(item, gIndex, tIndex) {
      if (!item.note) return;
      const ptnUrl =
        /^(.*?)[（\[]?(https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+)[）\]]?$/;
      let val = item.note;
      let url = "";
      const isLink = ptnUrl.test(val);
      if (isLink) {
        const m = ptnUrl.exec(val);
        val = m[1];
        url = m[2];
        if (!val) {
          val = url;
        }
      }
      item.notes.unshift({
        isLink: isLink,
        val: val,
        url: url,
      });
      document
        .getElementById(`collapse-${gIndex}-${tIndex}`)
        .classList.add("show");
      document
        .querySelector(`h2[id=heading-${gIndex}-${tIndex}]>button`)
        .classList.remove("collapsed");
      delete item.note;
    },
    delTask(item, index) {
      const vm = this;
      item.splice(index, 1);
    },
    delGroup(index) {
      const vm = this;
      vm.tasks.splice(index, 1);
    },
    delNote(item, index) {
      const vm = this;
      item.splice(index, 1);
    },
  },
});

const setClassLimitDateForAll = () => {
  const checkLimitArray = document.querySelectorAll('[id^="use-limit-"]');
  for (const checkLimit of checkLimitArray) {
    const gIndex = checkLimit.id.match(/\d+$/)[0];
    const inputDateArray = document.querySelectorAll(
      `[id^="limit-date-${gIndex}-"]`
    );
    for (const inputDate of inputDateArray) {
      setClassLimitDate(inputDate, checkLimit.checked);
    }
  }
};

const setClassLimitDate = (element, useLimit) => {
  element.classList.remove("bg-danger");
  element.classList.remove("fw-bold");
  element.classList.remove("text-danger");
  element.classList.remove("text-white");
  element.classList.remove("text-primary");
  element.classList.remove("text-disabled");
  const targetDate = new Date(element.value);
  if (Number.isNaN(targetDate.getTime())) {
    element.classList.add(useLimit ? "text-white" : "text-disabled");
    element.blur();
    return;
  }
  if (!useLimit) return;
  const diffDay = Math.floor(
    (targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24) + 1
  );
  if (diffDay === 0) {
    element.classList.add("text-danger");
    element.classList.add("fw-bold");
  } else if (diffDay < 0) {
    element.classList.add("bg-danger");
    element.classList.add("fw-bold");
    element.classList.add("text-white");
  } else if (diffDay <= 7) {
    element.classList.add("text-primary");
  }
  element.blur();
};
