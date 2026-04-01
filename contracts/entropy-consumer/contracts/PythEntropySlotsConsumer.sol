// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal Entropy v2 consumer skeleton for future Slots randomness integration.
/// @dev This contract is intentionally a scaffold. It is not wired to deployment tooling yet.

interface IEntropyV2 {
    function getFeeV2() external view returns (uint128 feeAmount);
    function requestV2() external payable returns (uint64 assignedSequenceNumber);
}

abstract contract IEntropyConsumer {
    function _entropyCallback(
        uint64 sequence,
        address provider,
        bytes32 randomNumber
    ) external {
        address entropy = getEntropy();
        require(entropy != address(0), "Entropy address not set");
        require(msg.sender == entropy, "Only Entropy can call this function");

        entropyCallback(sequence, provider, randomNumber);
    }

    function getEntropy() internal view virtual returns (address);

    function entropyCallback(
        uint64 sequence,
        address provider,
        bytes32 randomNumber
    ) internal virtual;
}

contract PythEntropySlotsConsumer is IEntropyConsumer {
    struct PendingRequest {
        address requester;
        bytes32 commitment;
        bool fulfilled;
        bytes32 randomNumber;
    }

    address public owner;
    address public entropy;
    uint32 public defaultCallbackGasLimit;

    mapping(uint64 => PendingRequest) public pendingRequests;

    event EntropyRequested(uint64 indexed sequenceNumber, address indexed requester, bytes32 commitment, uint32 gasLimit);
    event EntropyFulfilled(uint64 indexed sequenceNumber, bytes32 randomNumber);

    error OnlyOwner();
    error RequestAlreadyFulfilled();
    error CallbackGasLimitTooLow();

    constructor(address entropyAddress, address providerAddress, uint32 callbackGasLimit) {
        owner = msg.sender;
        entropy = entropyAddress;
        defaultCallbackGasLimit = callbackGasLimit;
        providerAddress;
    }

    function requestSlotsRandomness(bytes32 userCommitment) external payable returns (uint64 sequenceNumber) {
        return requestSlotsRandomnessWithCustomGas(userCommitment, defaultCallbackGasLimit);
    }

    function requestSlotsRandomnessWithCustomGas(
        bytes32 userCommitment,
        uint32 callbackGasLimit
    ) public payable returns (uint64 sequenceNumber) {
        if (callbackGasLimit < 100_000) revert CallbackGasLimitTooLow();

        uint128 fee = IEntropyV2(entropy).getFeeV2();
        require(msg.value >= fee, "Insufficient Entropy fee");

        sequenceNumber = IEntropyV2(entropy).requestV2{value: fee}();
        pendingRequests[sequenceNumber] = PendingRequest({
            requester: msg.sender,
            commitment: userCommitment,
            fulfilled: false,
            randomNumber: bytes32(0)
        });

        emit EntropyRequested(sequenceNumber, msg.sender, userCommitment, callbackGasLimit);
    }

    function getEntropy() internal view override returns (address) {
        return entropy;
    }

    function entropyCallback(
        uint64 sequenceNumber,
        address providerAddress,
        bytes32 randomNumber
    ) internal override {
        PendingRequest storage request = pendingRequests[sequenceNumber];
        if (request.fulfilled) revert RequestAlreadyFulfilled();

        request.fulfilled = true;
        request.randomNumber = randomNumber;

        providerAddress;
        emit EntropyFulfilled(sequenceNumber, randomNumber);
    }

    function setEntropy(address nextEntropy) external {
        if (msg.sender != owner) revert OnlyOwner();
        entropy = nextEntropy;
    }

    function setProvider(address nextProvider) external {
        if (msg.sender != owner) revert OnlyOwner();
        nextProvider;
    }

    function setDefaultCallbackGasLimit(uint32 nextGasLimit) external {
        if (msg.sender != owner) revert OnlyOwner();
        if (nextGasLimit < 100_000) revert CallbackGasLimitTooLow();
        defaultCallbackGasLimit = nextGasLimit;
    }
}
