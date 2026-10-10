using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Threading;
using System.Windows;
using System.Windows.Input;
using Forms = System.Windows.Forms;

namespace LumeSyncTeacherInstaller;

public partial class MainWindow : Window
{
    private bool _isInstalling;

    public MainWindow()
    {
        InitializeComponent();
        InstallPathTextBox.Text = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),
            "LumeSync Teacher");
    }

    private void Window_MouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed)
        {
            DragMove();
        }
    }

    private void MinButton_Click(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        if (_isInstalling)
        {
            System.Windows.MessageBox.Show("安装正在进行，请稍候。", "安装程序",
                MessageBoxButton.OK, MessageBoxImage.Information);
            return;
        }

        Close();
    }

    private void BrowseButton_Click(object sender, RoutedEventArgs e)
    {
        using var dialog = new Forms.FolderBrowserDialog
        {
            Description = "选择安装目录",
            UseDescriptionForTitle = true
        };
        if (Directory.Exists(InstallPathTextBox.Text))
        {
            dialog.InitialDirectory = InstallPathTextBox.Text;
        }

        if (dialog.ShowDialog() == Forms.DialogResult.OK && !string.IsNullOrWhiteSpace(dialog.SelectedPath))
        {
            InstallPathTextBox.Text = dialog.SelectedPath;
        }
    }

    private async void InstallButton_Click(object sender, RoutedEventArgs e)
    {
        var targetDir = InstallPathTextBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(targetDir))
        {
            System.Windows.MessageBox.Show("请选择有效的安装路径。", "安装程序",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        if (targetDir.Contains('"'))
        {
            System.Windows.MessageBox.Show("安装路径不能包含双引号字符。", "安装程序",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            return;
        }

        _isInstalling = true;
        InstallButton.IsEnabled = false;
        StatusText.Text = "正在安装... 0%";
        InstallProgress.IsIndeterminate = false;
        InstallProgress.Value = 0;
        using var progressCts = new CancellationTokenSource();
        var progressTask = SimulateInstallProgressAsync(progressCts.Token);

        try
        {
            var coreInstaller = await ExtractCoreInstallerAsync();
            var exitCode = await RunCoreInstallerAsync(coreInstaller, targetDir);
            TryDeleteTempFile(coreInstaller);
            progressCts.Cancel();
            await progressTask;

            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = exitCode == 0 ? 100 : 0;

            if (exitCode != 0)
            {
                StatusText.Text = $"安装失败（退出码：{exitCode}）";
                InstallButton.IsEnabled = true;
                _isInstalling = false;
                return;
            }

            StatusText.Text = "安装成功完成。 100%";
            InstallButton.Visibility = Visibility.Collapsed;
            DoneButton.Visibility = Visibility.Visible;
            DoneButton.Focus();
        }
        catch (Exception ex)
        {
            progressCts.Cancel();
            await progressTask;
            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = 0;
            StatusText.Text = "安装失败。";
            InstallButton.IsEnabled = true;
            System.Windows.MessageBox.Show(ex.Message, "安装程序错误", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _isInstalling = false;
        }
    }

    private void DoneButton_Click(object sender, RoutedEventArgs e)
    {
        if (LaunchCheckBox.IsChecked == true)
        {
            var exePath = Path.Combine(InstallPathTextBox.Text.Trim(), "LumeSyncTeacherShell.exe");
            if (File.Exists(exePath))
            {
                Process.Start(new ProcessStartInfo
                {
                    FileName = exePath,
                    UseShellExecute = true
                });
            }
        }

        Close();
    }

    private static async Task<string> ExtractCoreInstallerAsync()
    {
        var assembly = Assembly.GetExecutingAssembly();
        await using var installerStream = assembly.GetManifestResourceStream("CoreInstaller.bin");
        if (installerStream is null)
        {
            throw new InvalidOperationException("缺少内嵌安装载荷。");
        }

        var tempFile = Path.Combine(Path.GetTempPath(), $"lumesync-core-{Guid.NewGuid():N}.exe");
        await using var fileStream = File.Create(tempFile);
        await installerStream.CopyToAsync(fileStream);
        return tempFile;
    }

    private static async Task<int> RunCoreInstallerAsync(string installerPath, string installDir)
    {
        var args = $"/S /D={installDir}";
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = installerPath,
                Arguments = args,
                UseShellExecute = false,
                CreateNoWindow = true
            }
        };

        process.Start();
        await process.WaitForExitAsync();
        return process.ExitCode;
    }

    private async Task SimulateInstallProgressAsync(CancellationToken token)
    {
        while (!token.IsCancellationRequested)
        {
            await Dispatcher.InvokeAsync(() =>
            {
                if (InstallProgress.Value >= 95)
                {
                    return;
                }

                if (InstallProgress.Value < 20)
                {
                    InstallProgress.Value += 2;
                    StatusText.Text = $"正在准备安装... {(int)InstallProgress.Value}%";
                    return;
                }

                if (InstallProgress.Value < 75)
                {
                    InstallProgress.Value += 1.5;
                    StatusText.Text = $"正在复制和配置文件... {(int)InstallProgress.Value}%";
                    return;
                }

                InstallProgress.Value += 0.6;
                StatusText.Text = $"正在完成收尾步骤... {(int)InstallProgress.Value}%";
            });

            try
            {
                await Task.Delay(220, token);
            }
            catch (OperationCanceledException)
            {
                return;
            }
        }
    }

    private static void TryDeleteTempFile(string path)
    {
        try
        {
            if (File.Exists(path))
            {
                File.Delete(path);
            }
        }
        catch
        {
        }
    }
}
