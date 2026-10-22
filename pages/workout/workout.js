const app = getApp();
const storage = require('../../utils/storage');
const workoutUtil = require('../../utils/workout');
const format = require('../../utils/format');
const dateUtil = require('../../utils/date');
const cardioUtil = require('../../utils/cardio');
const timeUtil = require('../../utils/time');

Page({
  data: {
    theme: 'dark',
    workout: null,
    unit: 'kg',
    elapsedLabel: '00:00:00',
    totalSets: 0,
    cardioCount: 0,
    profileWeightKg: 0,
    restActive: false,
    restLabel: '00:00',
    restTotal: 90,
    isEditing: false
  },

  onLoad(options) {
    this._workoutId = options.workoutId || '';
    this._isEditing = options.edit === '1';
    this._elapsedTimer = null;
    this._restTimer = null;
    this._restEndsAt = 0;
    this._restTotal = 90;
    this._audio = null;
    this.setData({ isEditing: this._isEditing });
    this.initAudio();
    this.loadWorkout();
  },

  onShow() {
    app.applyTheme(this);
    this.loadWorkout();
    this.startElapsedTimer();
    this.resumeRestTimer();
    wx.setKeepScreenOn({ keepScreenOn: true });
  },

  onHide() {
    this.stopTimers();
    wx.setKeepScreenOn({ keepScreenOn: false });
  },

  onUnload() {
    this.stopTimers();
    wx.setKeepScreenOn({ keepScreenOn: false });
    if (this._audio) {
      this._audio.destroy();
      this._audio = null;
    }
  },

  initAudio() {
    try {
      const audio = wx.createInnerAudioContext();
      audio.src = '/assets/beep.wav';
      audio.volume = 0.65;
      audio.obeyMuteSwitch = false;
      audio.onError(() => {});
      this._audio = audio;
    } catch (e) {
      this._audio = null;
    }
  },

  playBeep() {
    if (!this._audio) return;
    try {
      this._audio.seek(0);
      this._audio.play();
    } catch (e) {}
  },

  loadWorkout() {
    const db = storage.getDB();
    if (!db.settings.onboarded) {
      wx.reLaunch({ url: '/pages/onboarding/onboarding' });
      return;
    }

    let workout = null;
    if (this._isEditing) {
      workout = db.workouts.find((item) => item.id === this._workoutId);
      if (!workout) {
        wx.showToast({ title: '训练记录不存在', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 400);
        return;
      }
      workout = JSON.parse(JSON.stringify(workout));
    } else {
      workout = db.activeWorkout;
      if (!workout) {
        workout = workoutUtil.createWorkout(db.settings);
        db.activeWorkout = workout;
        storage.saveDB(db);
      }
      workout = JSON.parse(JSON.stringify(workout));
    }

    const profileWeightKg = Number(db.profile && db.profile.weightKg) || 0;
    this.profileWeightKg = profileWeightKg;
    const decorated = this.decorateWorkout(workout, db, db.settings.unit || 'kg');
    this.setData({
      workout: decorated,
      unit: db.settings.unit || 'kg',
      totalSets: workoutUtil.countCompletedSets(workout),
      cardioCount: this.countCardio(workout),
      profileWeightKg,
      isEditing: this._isEditing
    });
    this.updateElapsed();
    if (this.data.restActive && this._restEndsAt) {
      this.setData({ restTotal: this._restTotal });
    }
  },

  decorateWorkout(workout, db, unit) {
    const copy = JSON.parse(JSON.stringify(workout));
    const otherWorkouts = (db.workouts || []).filter((item) => item.id !== copy.id);
    copy.exercises = (copy.exercises || []).map((exercise) => {
      const performance = workoutUtil.getLastExercisePerformance(otherWorkouts, exercise.exerciseId);
      const isCardio = cardioUtil.isCardio(exercise);
      const cardioType = isCardio ? cardioUtil.typeFromExercise(exercise) : '';
      const cardio = isCardio
        ? this.decorateCardioCalories(
          cardioUtil.decorate(exercise.cardio, cardioType),
          cardioType,
          db.profile && db.profile.weightKg
        )
        : null;
      return Object.assign({}, exercise, {
        isCardio,
        cardioType,
        cardioMeta: isCardio ? cardioUtil.getMeta(cardioType) : null,
        cardio,
        completed: isCardio ? cardio.valid : !!exercise.completed,
        lastHint: workoutUtil.formatLastHint(performance, exercise.type, unit, db.profile && db.profile.weightKg),
        showNote: !!exercise.note,
        sets: (exercise.sets || []).map((set) => Object.assign({}, set, {
          weightDisplay: format.weightToDisplay(set.weight || 0, unit)
        }))
      });
    });
    if (!copy.name || copy.name === '自由训练') {
      copy.name = workoutUtil.composeWorkoutName(copy.exercises);
    }
    return copy;
  },

  decorateCardioCalories(cardio, cardioType, weightKg) {
    if (!cardio || cardio.caloriesManual) return cardio;
    const weight = Number(weightKg) || 0;
    const estimate = cardioUtil.estimateCalories(cardio, cardioType, weight);
    if (estimate > 0) {
      cardio.calories = estimate;
      cardio.summary = cardioUtil.summary(cardio, cardioType);
    }
    return cardio;
  },

  applyCardioValues(exercise, cardio, displayField, displayValue, recalcCalories) {
    // A change to duration, distance, speed or grade always refreshes the
    // estimate, even if the user had manually edited calories before.
    if (recalcCalories) {
      const weight = Number(this.profileWeightKg) || 0;
      const estimate = cardioUtil.estimateCalories(cardio, exercise.cardioType, weight);
      if (estimate > 0) {
        cardio.calories = estimate;
        cardio.caloriesManual = false;
      }
    }
    const decorated = cardioUtil.decorate(cardio, exercise.cardioType);
    if (displayField) decorated[`${displayField}Display`] = displayValue;
    exercise.cardio = decorated;
    exercise.completed = decorated.valid;
  },

  persistWorkout() {
    if (!this.data.workout) return;
    const clean = workoutUtil.stripWorkoutForStorage(this.data.workout);
    const db = storage.getDB();
    if (this._isEditing) {
      const index = db.workouts.findIndex((item) => item.id === clean.id);
      if (index >= 0) db.workouts[index] = clean;
    } else {
      db.activeWorkout = clean;
    }
    storage.saveDB(db);
  },

  countCardio(workout) {
    return (workout.exercises || []).filter((exercise) => (
      cardioUtil.isCardio(exercise) && cardioUtil.isValid(exercise.cardio)
    )).length;
  },

  updateMeta() {
    if (!this.data.workout) return;
    this.setData({
      totalSets: workoutUtil.countCompletedSets(this.data.workout),
      cardioCount: this.countCardio(this.data.workout)
    });
  },

  startElapsedTimer() {
    if (this._elapsedTimer) clearInterval(this._elapsedTimer);
    this.updateElapsed();
    this._elapsedTimer = setInterval(() => this.updateElapsed(), 1000);
  },

  updateElapsed() {
    if (!this.data.workout) return;
    const ms = workoutUtil.durationMs(this.data.workout);
    this.setData({ elapsedLabel: dateUtil.formatElapsed(ms) });
  },

  stopTimers() {
    if (this._elapsedTimer) {
      clearInterval(this._elapsedTimer);
      this._elapsedTimer = null;
    }
    if (this._restTimer) {
      clearInterval(this._restTimer);
      this._restTimer = null;
    }
  },

  startRest(seconds) {
    const total = Math.max(1, Number(seconds) || 90);
    this._restEndsAt = Date.now() + total * 1000;
    this._restTotal = total;
    this.setData({
      restActive: true,
      restTotal: total,
      restLabel: dateUtil.formatClock(total)
    });
    this.startRestTimer();
  },

  startRestTimer() {
    if (this._restTimer) clearInterval(this._restTimer);
    this._restTimer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((this._restEndsAt - Date.now()) / 1000));
      this.setData({ restLabel: dateUtil.formatClock(remaining) });
      if (remaining <= 0) this.finishRest();
    }, 500);
  },

  resumeRestTimer() {
    if (this._restEndsAt && this._restEndsAt > Date.now()) {
      this.setData({
        restActive: true,
        restTotal: this._restTotal,
        restLabel: dateUtil.formatClock(Math.ceil((this._restEndsAt - Date.now()) / 1000))
      });
      this.startRestTimer();
    } else if (this.data.restActive) {
      this.setData({ restActive: false });
    }
  },

  finishRest() {
    if (this._restTimer) {
      clearInterval(this._restTimer);
      this._restTimer = null;
    }
    this._restEndsAt = 0;
    this.setData({ restActive: false, restLabel: '00:00' });
    wx.vibrateLong({});
    this.playBeep();
    wx.showToast({ title: '休息结束', icon: 'none' });
  },

  adjustRest(e) {
    const action = e.currentTarget.dataset.action;
    if (action === 'skip') {
      this.finishRest();
      return;
    }
    const delta = action === 'plus' ? 15000 : -15000;
    this._restEndsAt += delta;
    if (this._restEndsAt <= Date.now()) {
      this.finishRest();
      return;
    }
    if (!this._restTimer) this.startRestTimer();
    this.setData({
      restLabel: dateUtil.formatClock(Math.ceil((this._restEndsAt - Date.now()) / 1000))
    });
  },

  addExercise() {
    wx.navigateTo({
      url: '/pages/exercise-picker/exercise-picker',
      events: {
        selectExercise: (exercise) => {
          this.addExerciseToWorkout(exercise);
        }
      }
    });
  },

  addExerciseToWorkout(exercise) {
    const db = storage.getDB();
    const performance = workoutUtil.getLastExercisePerformance(db.workouts, exercise.id);
    const workout = this.data.workout;
    const workoutExercise = workoutUtil.createWorkoutExercise(
      exercise,
      db.settings,
      workoutUtil.formatLastHint(performance, exercise.type, db.settings.unit || 'kg', db.profile && db.profile.weightKg),
      performance ? performance.last : null,
      performance ? performance.cardio : null
    );
    workout.exercises.push(workoutExercise);
    if (!this._isEditing) {
      workout.name = workoutUtil.composeWorkoutName(workout.exercises);
    }
    // Re-decorate every exercise after insertion. Newly added exercises need
    // isCardio/cardioMeta/display fields just like exercises loaded from storage.
    const decorated = this.decorateWorkout(workout, db, db.settings.unit || 'kg');
    this.setData({
      workout: decorated,
      totalSets: workoutUtil.countCompletedSets(decorated),
      cardioCount: this.countCardio(decorated)
    }, () => {
      this.persistWorkout();
      wx.vibrateShort({});
      wx.pageScrollTo({ scrollTop: 99999, duration: 300 });
    });
  },

  addSet(e) {
    const index = Number(e.currentTarget.dataset.ex);
    if (!this.data.workout || !this.data.workout.exercises[index]) return;
    const workout = JSON.parse(JSON.stringify(this.data.workout));
    const exercise = workout.exercises[index];
    if (cardioUtil.isCardio(exercise)) return;
    if (!Array.isArray(exercise.sets)) exercise.sets = [];
    const last = exercise.sets[exercise.sets.length - 1];
    const nextSet = workoutUtil.createSet(exercise.type, last || {});
    nextSet.weightDisplay = format.weightToDisplay(nextSet.weight || 0, this.data.unit);
    exercise.sets.push(nextSet);
    this.setData({
      workout,
      totalSets: workoutUtil.countCompletedSets(workout),
      cardioCount: this.countCardio(workout)
    }, () => {
      this.persistWorkout();
      wx.vibrateShort({});
    });
  },

  removeSet(e) {
    const index = Number(e.currentTarget.dataset.ex);
    const setIndex = Number(e.currentTarget.dataset.set);
    wx.showModal({
      title: '删除这一组？',
      content: '删除后不会影响其他组。',
      confirmText: '删除',
      confirmColor: '#FF7474',
      success: (res) => {
        if (!res.confirm) return;
        const workout = this.data.workout;
        workout.exercises[index].sets.splice(setIndex, 1);
        this.setData({ workout }, () => {
          this.persistWorkout();
          this.updateMeta();
        });
      }
    });
  },

  onSetInput(e) {
    const exIndex = Number(e.currentTarget.dataset.ex);
    const setIndex = Number(e.currentTarget.dataset.set);
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const workout = this.data.workout;
    const set = workout.exercises[exIndex].sets[setIndex];
    if (field === 'weight') {
      set.weightDisplay = value;
      set.weight = format.weightFromDisplay(value, this.data.unit);
    } else if (field === 'reps') {
      set.reps = Math.max(0, parseInt(value, 10) || 0);
    } else if (field === 'duration') {
      set.duration = Math.max(0, parseInt(value, 10) || 0);
    }
    this.setData({ workout });
  },

  onSetBlur() {
    this.persistWorkout();
  },

  stepSet(e) {
    const exIndex = Number(e.currentTarget.dataset.ex);
    const setIndex = Number(e.currentTarget.dataset.set);
    const field = e.currentTarget.dataset.field;
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    const workout = this.data.workout;
    const set = workout.exercises[exIndex].sets[setIndex];
    if (field === 'weight') {
      const next = Math.max(0, format.roundTo((Number(set.weightDisplay) || 0) + delta, 1));
      set.weightDisplay = next;
      set.weight = format.weightFromDisplay(next, this.data.unit);
    } else if (field === 'reps') {
      set.reps = Math.max(0, (Number(set.reps) || 0) + delta);
    } else if (field === 'duration') {
      set.duration = Math.max(0, (Number(set.duration) || 0) + delta);
    }
    this.setData({ workout }, () => this.persistWorkout());
  },

  toggleSet(e) {
    const exIndex = Number(e.currentTarget.dataset.ex);
    const setIndex = Number(e.currentTarget.dataset.set);
    const workout = this.data.workout;
    const exercise = workout.exercises[exIndex];
    const set = exercise.sets[setIndex];
    set.completed = !set.completed;
    this.setData({
      workout,
      totalSets: workoutUtil.countCompletedSets(workout)
    }, () => {
      this.persistWorkout();
      if (set.completed) {
        wx.vibrateShort({});
        this.startRest(exercise.restSeconds || 90);
      }
    });
  },

  setCardioMode(e) {
    const index = Number(e.currentTarget.dataset.ex);
    const mode = e.currentTarget.dataset.mode;
    const exercise = this.data.workout.exercises[index];
    if (!exercise || !exercise.isCardio) return;
    const cardio = cardioUtil.create(exercise.cardioType, exercise.cardio);
    cardio.mode = mode === 'interval' ? 'interval' : 'steady';
    if (cardio.mode === 'interval' && !cardio.rounds && !cardio.workSec) {
      cardio.rounds = 8;
      cardio.workSec = 60;
      cardio.restSec = 60;
    }
    this.applyCardioValues(exercise, cardio, null, null, true);
    this.setData({
      workout: this.data.workout,
      cardioCount: this.countCardio(this.data.workout)
    }, () => this.persistWorkout());
  },

  onCardioInput(e) {
    const index = Number(e.currentTarget.dataset.ex);
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    const exercise = this.data.workout.exercises[index];
    if (!exercise || !exercise.isCardio) return;
    const current = exercise.cardio || {};
    const cardio = cardioUtil.create(exercise.cardioType, current);
    const currentDuration = Number(current.durationSec) || 0;
    const currentWork = Number(current.workSec) || 0;
    const currentRest = Number(current.restSec) || 0;
    const calorieFields = [
      'durationMin', 'durationSecPart',
      'workMin', 'workSecPart', 'restMin', 'restSecPart',
      'rounds', 'distanceKm', 'incline', 'avgIncline', 'avgSpeed'
    ];
    const recalcCalories = calorieFields.indexOf(field) >= 0;

    if (field === 'durationMin') {
      cardio.durationSec = Math.max(0, parseInt(value, 10) || 0) * 60 + (currentDuration % 60);
    } else if (field === 'durationSecPart') {
      cardio.durationSec = Math.floor(currentDuration / 60) * 60
        + Math.min(59, Math.max(0, parseInt(value, 10) || 0));
    } else if (field === 'workMin') {
      cardio.workSec = Math.max(0, parseInt(value, 10) || 0) * 60 + (currentWork % 60);
    } else if (field === 'workSecPart') {
      cardio.workSec = Math.floor(currentWork / 60) * 60
        + Math.min(59, Math.max(0, parseInt(value, 10) || 0));
    } else if (field === 'restMin') {
      cardio.restSec = Math.max(0, parseInt(value, 10) || 0) * 60 + (currentRest % 60);
    } else if (field === 'restSecPart') {
      cardio.restSec = Math.floor(currentRest / 60) * 60
        + Math.min(59, Math.max(0, parseInt(value, 10) || 0));
    } else if (field === 'strokeType' || field === 'notes') {
      cardio[field] = value;
    } else if (field === 'calories') {
      const number = parseFloat(value);
      cardio.calories = Number.isFinite(number) ? Math.max(0, number) : 0;
      cardio.caloriesManual = true;
    } else if (['distanceKm', 'incline', 'avgIncline', 'avgSpeed'].indexOf(field) >= 0) {
      // Keep the raw text while editing so a trailing decimal point is not
      // immediately reformatted back to an integer.
      const number = parseFloat(value);
      cardio[field] = Number.isFinite(number) ? Math.max(0, number) : 0;
      this.applyCardioValues(exercise, cardio, field, value, recalcCalories);
      this.setData({
        workout: this.data.workout,
        cardioCount: this.countCardio(this.data.workout)
      });
      return;
    } else {
      const number = parseFloat(value);
      cardio[field] = Number.isFinite(number) ? Math.max(0, number) : 0;
    }

    this.applyCardioValues(exercise, cardio, null, null, recalcCalories);
    this.setData({
      workout: this.data.workout,
      cardioCount: this.countCardio(this.data.workout)
    });
  },

  toggleExerciseNote(e) {
    const index = Number(e.currentTarget.dataset.ex);
    const workout = this.data.workout;
    workout.exercises[index].showNote = !workout.exercises[index].showNote;
    this.setData({ workout });
  },

  onExerciseNoteInput(e) {
    const index = Number(e.currentTarget.dataset.ex);
    const workout = this.data.workout;
    workout.exercises[index].note = e.detail.value;
    this.setData({ workout });
  },

  onWorkoutNoteInput(e) {
    const workout = this.data.workout;
    workout.note = e.detail.value;
    this.setData({ workout });
  },

  openExerciseMenu(e) {
    const index = Number(e.currentTarget.dataset.ex);
    const workout = this.data.workout;
    const exercise = workout.exercises[index];
    wx.showActionSheet({
      itemList: ['查看动作历史', '上移', '下移', '删除动作'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/exercise-detail/exercise-detail?id=${exercise.exerciseId}` });
        }
        if (res.tapIndex === 1) this.moveExercise(index, -1);
        if (res.tapIndex === 2) this.moveExercise(index, 1);
        if (res.tapIndex === 3) this.deleteExercise(index);
      }
    });
  },

  moveExercise(index, direction) {
    const workout = this.data.workout;
    const target = index + direction;
    if (target < 0 || target >= workout.exercises.length) {
      wx.showToast({ title: '已经到边了', icon: 'none' });
      return;
    }
    const list = workout.exercises;
    const temp = list[index];
    list[index] = list[target];
    list[target] = temp;
    this.setData({ workout }, () => this.persistWorkout());
  },

  deleteExercise(index) {
    const workout = this.data.workout;
    const exercise = workout.exercises[index];
    wx.showModal({
      title: `删除“${exercise.name}”？`,
      content: '这个动作下已记录的组也会一起删除。',
      confirmText: '删除',
      confirmColor: '#FF7474',
      success: (res) => {
        if (!res.confirm) return;
        workout.exercises.splice(index, 1);
        if (!workout.exercises.length) workout.name = '自由训练';
        this.setData({ workout }, () => {
          this.persistWorkout();
          this.updateMeta();
        });
      }
    });
  },

  finishWorkout() {
    const workout = this.data.workout;
    if (!workout) return;
    if (!workout.exercises.length) {
      if (this._isEditing) {
        wx.showModal({
          title: '没有动作',
          content: '这条训练记录里没有动作，无法保存修改。返回详情页吗？',
          confirmText: '返回',
          success: (res) => {
            if (res.confirm) wx.navigateBack();
          }
        });
        return;
      }
      wx.showModal({
        title: '结束这次训练？',
        content: '还没有添加训练动作，结束不会保存这次训练。',
        confirmText: '结束',
        cancelText: '继续训练',
        success: (res) => {
          if (res.confirm) this.discardActiveWorkout();
        }
      });
      return;
    }
    if (this.data.totalSets === 0 && this.data.cardioCount === 0) {
      wx.showModal({
        title: '还没有完成任何训练',
        content: '现在结束会保存为一次空训练，确定结束吗？',
        confirmText: '仍然结束',
        cancelText: '继续训练',
        success: (res) => {
          if (res.confirm) this.completeWorkout();
        }
      });
      return;
    }
    this.confirmCompleteWorkout();
  },

  confirmCompleteWorkout() {
    const parts = [];
    if (this.data.totalSets > 0) parts.push(`${this.data.totalSets} 组力量训练`);
    if (this.data.cardioCount > 0) parts.push(`${this.data.cardioCount} 项有氧训练`);
    wx.showModal({
      title: this._isEditing ? '保存这次修改？' : '结束本次训练？',
      content: parts.length
        ? `本次已记录${parts.join('、')}，结束后仍可在历史记录中查看和编辑。`
        : '结束后这次训练将被保存。',
      confirmText: this._isEditing ? '保存' : '结束训练',
      cancelText: '继续训练',
      success: (res) => {
        if (res.confirm) this.completeWorkout();
      }
    });
  },

  discardActiveWorkout() {
    const db = storage.getDB();
    db.activeWorkout = null;
    storage.saveDB(db);
    wx.showToast({ title: '本次训练未记录', icon: 'none' });
    wx.switchTab({ url: '/pages/home/home' });
  },

  completeWorkout() {
    const clean = workoutUtil.stripWorkoutForStorage(this.data.workout);
    const db = storage.getDB();
    const now = timeUtil.nowChinaIso();
    if (this._isEditing) {
      const index = db.workouts.findIndex((item) => item.id === clean.id);
      if (index >= 0) {
        clean.endedAt = db.workouts[index].endedAt || now;
        clean.status = 'completed';
        db.workouts[index] = clean;
      }
    } else {
      clean.endedAt = now;
      clean.status = 'completed';
      db.workouts.unshift(clean);
      db.activeWorkout = null;
    }
    storage.saveDB(db);
    wx.redirectTo({
      url: `/pages/workout-detail/workout-detail?id=${clean.id}&summary=1`
    });
  }
});
