/**
 * This version has the following features added
 * 1. subscribers can be passed to register
 * 2. listen is now available as a public method and a param to register
 */

export default function Unifire (config) {
  const SUBSCRIPTIONS = {};
  const ACTIONS = {};
  const BARE_STATE = {};
  const LISTENERS = [];
  let DEPS = new Set();
  let PENDING_DELTA = {};
  let prior;
  let timeout;

  const STATE = new Proxy(BARE_STATE, {
    get (state, prop) {
      return isFunc(state[prop]) ? state[prop](STATE) : state[prop]
    },
    set (state, prop, next) {
      if (!isFunc(state[prop]) && state[prop] !== next) {
        state[prop] = PENDING_DELTA[prop] = next;
        callUniqueSubscribers();
      }
      return true;
    }
  });

  const isFunc = (val) => val instanceof Function;

  const deref = (obj, target = {}) => Object.assign(target, obj);

  const subscribe = (cb, override) => {
    // This is slightly smaller than Array.isArray
    if (cb instanceof Array) {
      DEPS = new Set(cb);
    } else {
      DEPS.clear();
      cb(new Proxy({}, {
        get (_, prop) {
          DEPS.add(prop);
          return STATE[prop];
        }
      }), {});
    }
    DEPS.forEach((dep) => SUBSCRIPTIONS[dep] && SUBSCRIPTIONS[dep].add(override || cb));
    return () => DEPS.forEach((dep) => SUBSCRIPTIONS[dep] && SUBSCRIPTIONS[dep].delete(override || cb));
  }

  const listen = (cb) => LISTENERS.push(cb);

  const callUniqueSubscribers = () => {
    // Inlining the debounce function is smaller
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      const uniqueSubscribers = new Set();
      for (const prop in PENDING_DELTA) {
        PENDING_DELTA[prop] !== prior[prop]
        && SUBSCRIPTIONS[prop]
        && SUBSCRIPTIONS[prop].forEach((sub) => uniqueSubscribers.add(sub));
      }
      const list = new Set(uniqueSubscribers, LISTENERS);
      list.forEach((sub) => sub(STATE, prior));
      PENDING_DELTA = {};
      prior = deref(STATE);
    });
  }

  const fire = (actionName, payload) => {
    return ACTIONS[actionName] && ACTIONS[actionName]({ state: STATE, fire }, payload);
  }

  const register = ({ state = {}, actions = {}, subscribers = [], listeners = [] }) => {
    for (const prop in state) SUBSCRIPTIONS[prop] = new Set();
    deref(actions, ACTIONS);
    deref(state, STATE);
    prior = deref(STATE);
    for (const prop in state) {
      if (isFunc(state[prop])) {
        subscribe(state[prop], () => SUBSCRIPTIONS[prop].forEach((sub) => sub(STATE, prior)));
      }
    }
    subscribers.forEach(subscribe);
    listeners.forEach(listen);
  }

  register(config);

  return { state: STATE, fire, subscribe, listen, register };
}
