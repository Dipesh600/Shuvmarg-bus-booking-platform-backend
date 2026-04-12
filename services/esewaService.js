const axios = require('axios');

const ESEWA_VERIFICATION_URL = 'https://rc.esewa.com.np/mobile/transaction';

/**
 * Verify eSewa transaction
 * @param {string} transactionId - The transaction reference ID from eSewa
 * @param {number} expectedAmount - The expected payment amount
 * @returns {object} - { success: boolean, amount: number, status: string, message: string }
 */
const verifyEsewaTransaction = async (transactionId, expectedAmount) => {
  try {
    // Make GET request to eSewa verification endpoint
    const response = await axios.get(`${ESEWA_VERIFICATION_URL}?txnRefId=${transactionId}`, {
      timeout: 10000, // 10 second timeout
    });

    console.log('eSewa verification response:', response.data);

    // Parse the response based on eSewa's format
    // Note: Adjust this based on actual eSewa response structure
    const { transactionDetails } = response.data;

    if (!transactionDetails) {
      return {
        success: false,
        message: 'Transaction not found or invalid response from eSewa',
      };
    }

    const { status, totalAmount } = transactionDetails;

    // Check if transaction is successful
    if (status !== 'COMPLETE' && status !== 'SUCCESS') {
      return {
        success: false,
        message: `Transaction status is ${status}, not successful`,
      };
    }

    // Check if amount matches
    if (parseFloat(totalAmount) !== expectedAmount) {
      return {
        success: false,
        message: `Transaction amount mismatch. Expected: ${expectedAmount}, Received: ${totalAmount}`,
      };
    }

    return {
      success: true,
      amount: parseFloat(totalAmount),
      status: status,
      message: 'Transaction verified successfully',
    };

  } catch (error) {
    console.error('eSewa verification error:', error.message);
    return {
      success: false,
      message: 'Failed to verify transaction with eSewa. Please try again.',
    };
  }
};

module.exports = {
  verifyEsewaTransaction,
};
