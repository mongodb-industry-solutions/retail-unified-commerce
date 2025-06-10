import { createSlice } from "@reduxjs/toolkit";

const AlertSlice = createSlice({
    name: "Alerts",
    initialState: {
        alerts: []
        // Alert: {id, message, type, duration}
    },
    reducers: {
        addAlert(state, action) {
            const alert = {
                ...action.payload,
                id: action.payload.id,
                message: action.payload.message
            };
            state.alerts.push(alert);
            // Auto-dismiss the alert after the duration
        },
        removeAlert(state, action) {
            console.log('remove alert')
            state.alerts = state.alerts.filter(alert => alert.id !== action.payload);
        },
    }
})

export const removeAlertAfterDelay = (id, delay = 5000) => (dispatch) => {
    setTimeout(() => {
      dispatch(removeAlert(id)); // Delay the removal by 3 seconds
    }, delay);
};

export const {
    addAlert,
    removeAlert
} = AlertSlice.actions

export default AlertSlice.reducer
