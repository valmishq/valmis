export type AlertType = {
	type: 'success' | 'warning' | 'error';
	title: string;
	message: string;
	duration: number;
	show: boolean;
};

export const initialAlertState: AlertType = {
	type: 'success',
	title: '',
	message: '',
	duration: 0,
	show: false
};

let alertState = $state(initialAlertState);

export function setAlert(alert: AlertType) {
	alertState = alert;
}

export function getAlert() {
	return alertState;
}
