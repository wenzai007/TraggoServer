import moment from 'moment';

interface Success {
    success: true;
    value: moment.Moment;
}

interface Failure {
    success: false;
    error: string;
}

enum Type {
    Operation = 'operation',
    Unit = 'unit',
    Value = 'value',
}

enum Operation {
    Divide = '/',
    Add = '+',
    Substract = '-',
}

enum Unit {
    Year = 'y',
    Month = 'M',
    Week = 'w',
    Day = 'd',
    Hour = 'h',
    Minute = 'm',
    Second = 's',
}

export const parseRelativeTime = (value: string, divide: 'endOf' | 'startOf', nowDate = moment()): Success | Failure => {
    if (isValidDate(value)) {
        return success(asDate(value));
    }

    if (value.substr(0, 3) === 'now') {
        let time = nowDate;
        let currentIndex = 'now'.length;

        let expectNext = Type.Operation;
        let lastOperation = Operation.Add;
        let lastNumber = -1;
        while (currentIndex < value.length) {
            const currentChar = value.charAt(currentIndex);
            switch (expectNext) {
                case Type.Operation:
                    if (!isOperation(currentChar)) {
                        return failure('Expected one of / + - at index ' + currentIndex + ' but was ' + currentChar);
                    }
                    lastOperation = currentChar;
                    expectNext = currentChar === Operation.Divide ? Type.Unit : Type.Value;
                    currentIndex++;
                    break;
                case Type.Value:
                    if (isNaN(parseInt(currentChar, 10))) {
                        return failure('Expected number at index ' + currentIndex + ' but was ' + currentChar);
                    }
                    let valueIndex = currentIndex;
                    while (!isNaN(parseInt(value.charAt(valueIndex + 1), 10)) && valueIndex + 1 < value.length) {
                        valueIndex++;
                    }
                    lastNumber = parseInt(value.substr(currentIndex, valueIndex), 10);

                    expectNext = Type.Unit;
                    currentIndex = valueIndex + 1;
                    break;
                case Type.Unit:
                    if (!isUnit(currentChar)) {
                        return failure(
                            'Expected unit (' + Object.values(Unit) + ') at index ' + currentIndex + ' but was ' + currentChar
                        );
                    }

                    // tslint:disable-next-line:no-nested-switch
                    switch (lastOperation) {
                        case Operation.Divide:
                            time = time[divide](currentChar);
                            expectNext = Type.Operation;
                            break;
                        case Operation.Add:
                            time = time.add(lastNumber, currentChar);
                            expectNext = Type.Operation;
                            break;
                        case Operation.Substract:
                            time = time.subtract(lastNumber, currentChar);
                            expectNext = Type.Operation;
                            break;
                        default:
                            throw new Error('oops');
                    }

                    currentIndex++;
                    break;
                default:
                    throw new Error('oopsie');
            }
        }
        if (expectNext === Type.Unit) {
            return failure('Expected unit at the end but got nothing');
        }
        if (expectNext === Type.Value) {
            return failure('Expected number at the end but got nothing');
        }
        return success(time);
    }

    if (value.indexOf('now') !== -1) {
        return failure("'now' must be at the start");
    }

    return failure("Expected valid date or 'now' at index 0");
};

export const success = (value: moment.Moment): Success => {
    return {success: true, value};
};
export const failure = (error: string): Failure => {
    return {success: false, error};
};

const isOperation = (char: string): char is Operation => {
    return Object.values(Operation).indexOf(char as Operation) !== -1;
};
const isUnit = (char: string): char is Unit => {
    return Object.values(Unit).indexOf(char as Unit) !== -1;
};

export const isValidDate = (value: string, format?: string) => {
    // Try RFC3339 format first (for backend compatibility)
    if (moment(value, moment.RFC_2822, true).isValid()) {
        return true;
    }
    if (moment(value, moment.ISO_8601, true).isValid()) {
        return true;
    }
    // Try the custom format
    return asDate(value, format).isValid();
};

export const asDate = (value: string, format = 'YYYY-MM-DD HH:mm') => {
    // Try RFC3339/ISO8601 first
    const isoDate = moment(value, moment.ISO_8601, true);
    if (isoDate.isValid()) {
        return isoDate;
    }
    // Fall back to custom format
    return moment(value, format, true);
};
export const isSameDate = (from: moment.Moment, to?: moment.Moment): boolean => {
    const fromString = from.format('YYYYMMDD');
    return to === undefined || fromString === to.format('YYYYMMDD');
};

// Convert any valid date string to RFC3339 format for backend
// IMPORTANT: Backend uses OmitTimeZone() which keeps time components but strips timezone
// To match this behavior, we format with UTC timezone but keep local time components
export const toRFC3339 = (value: string): string => {
    // If it starts with "now", return as-is (relative time)
    if (value.startsWith('now')) {
        return value;
    }

    // If it's already in ISO 8601 format, strip timezone like backend does
    if (moment(value, moment.ISO_8601, true).isValid()) {
        const date = moment(value, moment.ISO_8601, true);
        // Keep the time components but format as UTC (matching backend's OmitTimeZone behavior)
        return moment.utc([date.year(), date.month(), date.date(), date.hour(), date.minute(), date.second()]).format();
    }

    // Try to parse the date with custom format
    const date = asDate(value);
    if (date.isValid()) {
        // Keep the time components but format as UTC (matching backend's OmitTimeZone behavior)
        return moment.utc([date.year(), date.month(), date.date(), date.hour(), date.minute(), date.second()]).format();
    }

    // If invalid, return as-is and let backend handle the error
    return value;
};
