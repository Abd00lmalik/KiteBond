// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title KiteBondScanPayments
 * @notice Records instant npm package scan payment authorizations and proof anchors.
 * @dev Payment token: Test USDT on KiteAI Testnet (Chain ID 2368).
 */
contract KiteBondScanPayments is ReentrancyGuard, Ownable {
    IERC20 public immutable paymentToken;
    address public treasury;

    uint256 public quickScanPrice = 0;
    uint256 public standardScanPrice = 1 * 10 ** 18;
    uint256 public deepScanPrice = 3 * 10 ** 18;

    mapping(address => bool) public usedFreeScan;
    mapping(bytes32 => bool) public scanAuthorized;

    enum ScanDepth {
        Quick,
        Standard,
        Deep
    }

    event InstantScanAuthorized(
        address indexed user,
        bytes32 indexed packageNameHash,
        bytes32 versionHash,
        ScanDepth depth,
        uint256 amountPaid,
        bytes32 scanId,
        uint256 timestamp
    );

    event InstantScanProofAnchored(
        address indexed user,
        bytes32 indexed scanId,
        bytes32 reportHash,
        uint256 timestamp
    );

    constructor(address _paymentToken, address _treasury) Ownable(msg.sender) {
        require(_paymentToken != address(0), "Invalid token");
        require(_treasury != address(0), "Invalid treasury");
        paymentToken = IERC20(_paymentToken);
        treasury = _treasury;
    }

    function authorizeScan(
        bytes32 packageNameHash,
        bytes32 versionHash,
        ScanDepth depth,
        bytes32 scanId
    ) external nonReentrant {
        require(scanId != bytes32(0), "Invalid scan");
        require(!scanAuthorized[scanId], "Scan already authorized");

        uint256 price = _getPrice(depth);

        if (depth == ScanDepth.Quick && !usedFreeScan[msg.sender]) {
            usedFreeScan[msg.sender] = true;
            price = 0;
        }

        if (price > 0) {
            paymentToken.transferFrom(msg.sender, treasury, price);
        }

        scanAuthorized[scanId] = true;

        emit InstantScanAuthorized(
            msg.sender,
            packageNameHash,
            versionHash,
            depth,
            price,
            scanId,
            block.timestamp
        );
    }

    function anchorProof(bytes32 scanId, bytes32 reportHash) external {
        require(scanAuthorized[scanId], "Scan not authorized");
        require(reportHash != bytes32(0), "Invalid report hash");
        emit InstantScanProofAnchored(msg.sender, scanId, reportHash, block.timestamp);
    }

    function _getPrice(ScanDepth depth) internal view returns (uint256) {
        if (depth == ScanDepth.Quick) return quickScanPrice;
        if (depth == ScanDepth.Standard) return standardScanPrice;
        if (depth == ScanDepth.Deep) return deepScanPrice;
        revert("Invalid depth");
    }

    function setPrices(uint256 quick, uint256 standard, uint256 deep) external onlyOwner {
        quickScanPrice = quick;
        standardScanPrice = standard;
        deepScanPrice = deep;
    }

    function setTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Invalid treasury");
        treasury = _treasury;
    }

    function withdraw(uint256 amount) external onlyOwner {
        paymentToken.transfer(owner(), amount);
    }
}
