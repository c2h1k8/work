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
          task: [],
        },
      ];
    }
    vm.$set(vm, "tasks", saveTasks);
  },
  methods: {
    addClass($event) {
      $event.target.classList.remove("bg-info");
      $event.target.classList.add("hover");
    },
    removeClass($event) {
      $event.target.classList.remove("hover");
      $event.target.classList.add("bg-info");
    },
    changeClassDate($event) {
      setClassLimitDate($event.srcElement);
    },
    saveCurrent() {
      const vm = this;
      console.log(vm.tasks);
      const tasks = JSON.stringify(vm.tasks);
      localStorage.setItem("tasks", tasks);
    },
    addTask(item) {
      const vm = this;
      item.task.push({
        name: "",
        notes: [],
      });
    },
    addGroup() {
      const vm = this;
      vm.tasks.push({
        name: "",
        task: [],
      });
    },
    addNote(item) {
      if (!item.note) return;
      const pattern = /^https?:\/\/[\w/:%#\$&\?\(\)~\.=\+\-]+$/;
      const isLink = pattern.test(item.note);
      item.notes.unshift({
        isLink: isLink,
        val: item.note,
      });
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

window.addEventListener("load", () => {
  const inputDateArray = document.getElementsByClassName("limit-date");
  Array.prototype.forEach.call(inputDateArray, (element) => {
    setClassLimitDate(element);
  });
});

const setClassLimitDate = (element) => {
  const today = new Date();
  const targetDate = new Date(element.value);
  element.classList.remove("bg-danger");
  element.classList.remove("fw-bold");
  element.classList.remove("text-danger");
  element.classList.remove("text-white");
  element.classList.remove("text-primary");
  if (!targetDate) {
    return;
  }
  const diffDay = Math.floor(
    (targetDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24) + 1
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
};
