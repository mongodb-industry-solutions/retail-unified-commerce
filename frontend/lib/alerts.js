import { removeAlert, addAlert, removeAlertAfterDelay } from "@/redux/slices/AlertSlice";
import store from "@/redux/store";

export const addOperationAlert = (props) => {
    let { id, title, message } = props;
    store.dispatch(addAlert({
        id: id, // Make sure to give a unique ID for each alert
        title: title,
        message: message,
        type: 'progress', 
    }));
}

export const addAlertHnd = (props) => {
    let { id, type, title, message = '', duration } = props;
    store.dispatch(addAlert({
        id: id, // Make sure to give a unique ID for each alert
        title: title,
        message: message,
        type: type, 
        duration: duration
    }));
}

export const addSucAutoCloseAlertHnd = (props) => {
    let { id, title, message = '', duration=5000 } = props;
    store.dispatch(addAlert({
        id: id, // Make sure to give a unique ID for each alert
        title: title,
        message: message,
        type: 'success', 
        duration: duration
    }));
}
export const addWarnAutoCloseAlertHnd = (props) => {
    let { id, title, message = '', duration=5000 } = props;
    store.dispatch(addAlert({
        id: id, // Make sure to give a unique ID for each alert
        title: title,
        message: message,
        type: 'warning', 
        duration: duration
    }));
}

export const closeAlert = (id) => {
    store.dispatch(removeAlert(id))
}

export const closeAlertWithDelay = (id, delay) => {
    store.dispatch(removeAlertAfterDelay(id, delay))
}