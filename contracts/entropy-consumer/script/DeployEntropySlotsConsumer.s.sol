// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../contracts/PythEntropySlotsConsumer.sol";

contract DeployEntropySlotsConsumer is Script {
    function run() external returns (PythEntropySlotsConsumer consumer) {
        uint256 deployerPrivateKey = uint256(vm.envBytes32("PYTH_ENTROPY_V2_BRIDGE_PRIVATE_KEY"));
        address entropyAddress = vm.envAddress("PYTH_ENTROPY_V2_ENTROPY_ADDRESS");
        address providerAddress = vm.envAddress("PYTH_ENTROPY_V2_DEFAULT_PROVIDER");
        uint32 callbackGasLimit = uint32(vm.envUint("PYTH_ENTROPY_V2_CALLBACK_GAS_LIMIT"));

        vm.startBroadcast(deployerPrivateKey);
        consumer = new PythEntropySlotsConsumer(entropyAddress, providerAddress, callbackGasLimit);
        vm.stopBroadcast();
    }
}
