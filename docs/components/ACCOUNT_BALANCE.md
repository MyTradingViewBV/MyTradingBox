# Account Balance Component Documentation

## Overview

The Account Balance component displays the user's portfolio balance, profit/loss information, and recent transaction history.

## Features

### Balance Overview
- **Total Balance**: Current account value
- **Available Balance**: Liquid funds available for trading
- **Balance with Orders**: Total including open positions
- **Daily P&L**: Profit/loss for current day

### Performance Metrics
- **Realized P&L**: Profits from closed positions
- **Unrealized P&L**: Current open position values
- **Portfolio Change**: Percentage change over time
- **Risk Metrics**: Position sizing and exposure

### Transaction History
- **Recent Trades**: Latest buy/sell transactions
- **Order History**: Summary of order executions
- **Balance Changes**: Deposits, withdrawals, fees

## Technical Implementation

### Dependencies
- **AccountBalanceService**: Balance data fetching
- **AccountBalanceResponse**: Data structure for balance information
- **FooterComponent**: Navigation footer

### Key Services
- **AccountBalanceService**: API communication for balance data
- **Location**: Angular navigation service

### Data Processing
- **UI Data Building**: Transform API data into UI-friendly format
- **Percentage Calculations**: P&L and change computations
- **Data Validation**: Ensure data integrity before display

## Usage

### Viewing Balance
1. Component loads balance data on initialization
2. Displays current balance and P&L information
3. Shows recent transaction summary

### Refreshing Data
1. Use refresh button to update balance
2. Automatic updates on navigation
3. Manual refresh for latest data

### Navigation
- **Back Button**: Return to previous page
- **Footer Navigation**: Access other app sections

## Data Flow

1. **Data Fetch**: AccountBalanceService calls balance API
2. **Data Processing**: Transform raw data into display format
3. **UI Rendering**: Display balance cards and metrics
4. **Updates**: Manual or automatic data refresh

## Performance Considerations

- **Efficient Loading**: Minimal API calls with caching
- **Data Transformation**: Client-side calculations for responsiveness
- **Memory Management**: Proper cleanup of subscriptions
- **UI Optimization**: Fast rendering of balance data

## Error Handling

- **API Errors**: Display user-friendly error messages
- **Network Issues**: Offline handling with cached data
- **Data Validation**: Ensure balance data integrity
- **Loading States**: User feedback during data operations

## Testing

### Unit Tests
- Balance calculation logic
- Data transformation functions
- Component initialization

### Integration Tests
- API integration verification
- Data refresh functionality
- Error handling scenarios

## Future Enhancements

- **Detailed P&L**: Breakdown by asset and time period
- **Balance History**: Historical balance tracking
- **Export Reports**: PDF/CSV export of balance data
- **Alerts**: Balance threshold notifications
- **Multi-Currency**: Support for different fiat currencies